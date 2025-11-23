import { describe, it, expect, beforeEach } from 'vitest';
import { GET as categoriesGET } from '@/app/api/categories/route';
import { GET as pingGET } from '@/app/api/ping/route';
import { prismaMock, resetPrismaMock } from '@tests/mocks/prisma';
import { createMockRequest, parseJsonResponse } from '@tests/helpers/api-test-helpers';

describe('Categories & Basic APIs', () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  describe('GET /api/categories', () => {
    it('should return unique sorted categories', async () => {
      prismaMock.recipe.findMany.mockResolvedValue([
        { categories: 'עיקריות,מרקים' } as any,
        { categories: 'קינוחים' } as any,
        { categories: 'עיקריות,סלטים' } as any,
        { categories: 'מרקים' } as any
      ]);

      const request = createMockRequest('http://localhost:3000/api/categories');
      const response = await categoriesGET(request);

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);

      // Should have unique categories: עיקריות, מרקים, קינוחים, סלטים
      expect(json.data).toHaveLength(4);
      expect(json.data).toContain('עיקריות');
      expect(json.data).toContain('מרקים');
      expect(json.data).toContain('קינוחים');
      expect(json.data).toContain('סלטים');

      // Should be sorted
      expect(json.data).toEqual([...json.data].sort((a: string, b: string) =>
        a.localeCompare(b, 'he')
      ));
    });

    it('should handle empty categories', async () => {
      prismaMock.recipe.findMany.mockResolvedValue([
        { categories: null } as any,
        { categories: '' } as any,
        { categories: 'עיקריות' } as any
      ]);

      const request = createMockRequest('http://localhost:3000/api/categories');
      const response = await categoriesGET(request);

      const json = await parseJsonResponse(response);
      expect(json.data).toHaveLength(1);
      expect(json.data[0]).toBe('עיקריות');
    });

    it('should trim whitespace from categories', async () => {
      prismaMock.recipe.findMany.mockResolvedValue([
        { categories: '  עיקריות  ,  מרקים  ' } as any
      ]);

      const request = createMockRequest('http://localhost:3000/api/categories');
      const response = await categoriesGET(request);

      const json = await parseJsonResponse(response);
      expect(json.data).toHaveLength(2);
      expect(json.data).toContain('עיקריות');
      expect(json.data).toContain('מרקים');
    });

    it('should filter out empty strings', async () => {
      prismaMock.recipe.findMany.mockResolvedValue([
        { categories: 'עיקריות,,מרקים,' } as any  // Extra commas create empty strings
      ]);

      const request = createMockRequest('http://localhost:3000/api/categories');
      const response = await categoriesGET(request);

      const json = await parseJsonResponse(response);
      expect(json.data).toHaveLength(2);
      expect(json.data).not.toContain('');
    });
  });

  describe('GET /api/ping', () => {
    it('should return health status when DB is up', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);

      const request = createMockRequest('http://localhost:3000/api/ping');
      const response = await pingGET(request);

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.data.status).toBe('ok');
      expect(json.data.database).toBe('connected');
      expect(json.data).toHaveProperty('timestamp');
      expect(json.data).toHaveProperty('uptime');
      expect(typeof json.data.uptime).toBe('number');
    });

    it('should return 503 when DB is down', async () => {
      prismaMock.$queryRaw.mockRejectedValue(new Error('Connection refused'));

      const request = createMockRequest('http://localhost:3000/api/ping');
      const response = await pingGET(request);

      expect(response.status).toBe(503);
      const json = await parseJsonResponse(response);
      expect(json.status).toBe('error');
      expect(json.database).toBe('disconnected');
      expect(json).toHaveProperty('error');
    });

    it('should work without authentication', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);

      const request = createMockRequest('http://localhost:3000/api/ping');
      const response = await pingGET(request);

      // Should succeed without any auth headers
      expect(response.status).toBe(200);
    });
  });
});
