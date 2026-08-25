/**
 * @vitest-environment node
 *
 * Integration tests for the Places API (Wave 1.C). Prisma is mocked with
 * vitest-mock-extended; the Telegram Bot API is mocked at
 * `@/lib/telegram/botApi` so the real mirror/format code in
 * `@/lib/telegram/placeMirror` still runs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';
import { signSession } from '@/lib/auth/session';
import { sendMessage, editMessageText, TelegramApiError } from '@/lib/telegram/botApi';

vi.mock('@/lib/telegram/botApi', () => ({
  sendMessage: vi.fn(),
  editMessageText: vi.fn(),
  deleteMessage: vi.fn(),
  TelegramApiError: class TelegramApiError extends Error {}
}));

const sendMessageMock = vi.mocked(sendMessage);
const editMessageTextMock = vi.mocked(editMessageText);

const USER_ID = '111';

async function authHeaders(sub = USER_ID) {
  const token = await signSession({ sub, type: 'telegram', permissions: { can_edit: false } });
  return { authorization: `Bearer ${token}` };
}

function basePlaceRow(overrides: Partial<any> = {}) {
  return {
    id: 1,
    name: 'פיצה רומא',
    website: null,
    description: null,
    location: 'תל אביב',
    waze_link: null,
    type: 'restaurant',
    created_by: `${USER_ID} (${USER_ID})`,
    created_at: new Date('2024-01-01T10:00:00Z'),
    telegram_message_id: null,
    is_synced: false,
    last_sync: null,
    is_deleted: false,
    ...overrides
  };
}

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-jwt-secret-value-not-a-real-one';
  process.env.TELEGRAM_CHANNEL_ID = '-1001234567890';
});

describe('GET /api/places', () => {
  it('returns non-deleted places as a bare array', async () => {
    const { GET } = await import('@/app/api/places/route');

    prismaMock.place.findMany.mockResolvedValue([basePlaceRow()] as any);

    const request = createMockRequest('http://localhost:3000/api/places', { headers: await authHeaders() });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await parseJsonResponse<any>(response);
    expect(Array.isArray(json)).toBe(true);
    expect(json[0].name).toBe('פיצה רומא');

    expect(prismaMock.place.findMany).toHaveBeenCalledWith({
      where: { is_deleted: false },
      orderBy: { created_at: 'desc' }
    });
  });

  it('401s when unauthenticated', async () => {
    const { GET } = await import('@/app/api/places/route');

    const request = createMockRequest('http://localhost:3000/api/places');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});

describe('POST /api/places', () => {
  it('creates a place and mirrors it to Telegram', async () => {
    const { POST } = await import('@/app/api/places/route');

    prismaMock.place.create.mockResolvedValue(basePlaceRow() as any);
    sendMessageMock.mockResolvedValue({ message_id: 42 } as any);
    prismaMock.place.update.mockResolvedValue(basePlaceRow({ telegram_message_id: 42 }) as any);

    const request = createMockRequest('http://localhost:3000/api/places', {
      method: 'POST',
      headers: await authHeaders(),
      body: { name: 'פיצה רומא', location: 'תל אביב', type: 'restaurant' }
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const json = await parseJsonResponse<any>(response);
    expect(json.name).toBe('פיצה רומא');
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock.mock.calls[0][0].text).toContain('המלצה חדשה');
    expect(prismaMock.place.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { telegram_message_id: 42 } });
  });

  it('still creates the place when Telegram is down', async () => {
    const { POST } = await import('@/app/api/places/route');

    prismaMock.place.create.mockResolvedValue(basePlaceRow() as any);
    sendMessageMock.mockRejectedValue(new TelegramApiError({ method: 'sendMessage', error_code: 500, description: 'down' } as any));

    const request = createMockRequest('http://localhost:3000/api/places', {
      method: 'POST',
      headers: await authHeaders(),
      body: { name: 'פיצה רומא' }
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const json = await parseJsonResponse<any>(response);
    expect(json.name).toBe('פיצה רומא');
    expect(prismaMock.place.update).not.toHaveBeenCalled();
  });

  it('400s when name is missing', async () => {
    const { POST } = await import('@/app/api/places/route');

    const request = createMockRequest('http://localhost:3000/api/places', {
      method: 'POST',
      headers: await authHeaders(),
      body: { description: 'no name' }
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe('PUT /api/places/:id', () => {
  it('updates the place and mirrors the edit to Telegram', async () => {
    const { PUT } = await import('@/app/api/places/[id]/route');

    const existing = basePlaceRow({ telegram_message_id: 42 });
    prismaMock.place.findUnique.mockResolvedValue(existing as any);
    prismaMock.place.update.mockResolvedValue({ ...existing, name: 'פיצה רומא 2' } as any);
    editMessageTextMock.mockResolvedValue({ message_id: 42 } as any);

    const request = createMockRequest('http://localhost:3000/api/places/1', {
      method: 'PUT',
      headers: await authHeaders(),
      body: { name: 'פיצה רומא 2' }
    });

    const response = await PUT(request, { params: { id: '1' } });
    expect(response.status).toBe(200);
    const json = await parseJsonResponse<any>(response);
    expect(json.name).toBe('פיצה רומא 2');
    expect(editMessageTextMock).toHaveBeenCalledTimes(1);
    expect(editMessageTextMock.mock.calls[0][0].text).toContain('(עודכן)');
  });

  it('404s when the place does not exist', async () => {
    const { PUT } = await import('@/app/api/places/[id]/route');

    prismaMock.place.findUnique.mockResolvedValue(null);

    const request = createMockRequest('http://localhost:3000/api/places/999', {
      method: 'PUT',
      headers: await authHeaders(),
      body: { name: 'x' }
    });

    const response = await PUT(request, { params: { id: '999' } });
    expect(response.status).toBe(404);
  });

  it('has no ownership check — any authenticated user may update any place (ported from Flask)', async () => {
    const { PUT } = await import('@/app/api/places/[id]/route');

    const existing = basePlaceRow({ created_by: 'someone-else (999)' });
    prismaMock.place.findUnique.mockResolvedValue(existing as any);
    prismaMock.place.update.mockResolvedValue({ ...existing, name: 'updated' } as any);

    const request = createMockRequest('http://localhost:3000/api/places/1', {
      method: 'PUT',
      headers: await authHeaders(USER_ID),
      body: { name: 'updated' }
    });

    const response = await PUT(request, { params: { id: '1' } });
    expect(response.status).toBe(200);
  });
});

describe('DELETE /api/places/:id', () => {
  it('soft-deletes the place and mirrors the deletion to Telegram', async () => {
    const { DELETE } = await import('@/app/api/places/[id]/route');

    const existing = basePlaceRow({ telegram_message_id: 42 });
    prismaMock.place.findUnique.mockResolvedValue(existing as any);
    prismaMock.place.update.mockResolvedValue({ ...existing, is_deleted: true } as any);
    editMessageTextMock.mockResolvedValue({ message_id: 42 } as any);

    const request = createMockRequest('http://localhost:3000/api/places/1', {
      method: 'DELETE',
      headers: await authHeaders()
    });

    const response = await DELETE(request, { params: { id: '1' } });
    expect(response.status).toBe(204);

    expect(prismaMock.place.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { is_deleted: true } });
    expect(editMessageTextMock).toHaveBeenCalledTimes(1);
    expect(editMessageTextMock.mock.calls[0][0].text).toContain('❌ נמחק על ידי');
  });

  it('still soft-deletes when Telegram is down', async () => {
    const { DELETE } = await import('@/app/api/places/[id]/route');

    const existing = basePlaceRow({ telegram_message_id: 42 });
    prismaMock.place.findUnique.mockResolvedValue(existing as any);
    prismaMock.place.update.mockResolvedValue({ ...existing, is_deleted: true } as any);
    editMessageTextMock.mockRejectedValue(new TelegramApiError({ method: 'editMessageText', error_code: 500, description: 'down' } as any));

    const request = createMockRequest('http://localhost:3000/api/places/1', {
      method: 'DELETE',
      headers: await authHeaders()
    });

    const response = await DELETE(request, { params: { id: '1' } });
    expect(response.status).toBe(204);
  });

  it('404s when the place does not exist', async () => {
    const { DELETE } = await import('@/app/api/places/[id]/route');

    prismaMock.place.findUnique.mockResolvedValue(null);

    const request = createMockRequest('http://localhost:3000/api/places/999', {
      method: 'DELETE',
      headers: await authHeaders()
    });

    const response = await DELETE(request, { params: { id: '999' } });
    expect(response.status).toBe(404);
  });
});
