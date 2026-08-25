/**
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest';
import { verifyMcpToken } from '@/lib/mcp/auth';

const KEY = 'a-long-shared-family-key-0123456789abcdef';
const req = new Request('https://recipes.example/api/mcp', { method: 'POST' });

afterEach(() => {
  delete process.env.MCP_SHARED_KEY;
});

describe('verifyMcpToken', () => {
  it('accepts the exact shared key', async () => {
    process.env.MCP_SHARED_KEY = KEY;

    const auth = await verifyMcpToken(req, KEY);

    expect(auth).toMatchObject({ token: KEY, scopes: ['recipes:read'] });
  });

  it('rejects a wrong key of the same length', async () => {
    process.env.MCP_SHARED_KEY = KEY;

    const wrong = KEY.slice(0, -1) + 'X';
    expect(await verifyMcpToken(req, wrong)).toBeUndefined();
  });

  it('rejects a key of a different length', async () => {
    process.env.MCP_SHARED_KEY = KEY;

    expect(await verifyMcpToken(req, KEY + 'extra')).toBeUndefined();
  });

  it('rejects a missing token', async () => {
    process.env.MCP_SHARED_KEY = KEY;

    expect(await verifyMcpToken(req, undefined)).toBeUndefined();
  });

  it('fails closed when MCP_SHARED_KEY is not configured', async () => {
    expect(await verifyMcpToken(req, KEY)).toBeUndefined();
  });

  it('fails closed when MCP_SHARED_KEY is empty', async () => {
    process.env.MCP_SHARED_KEY = '';

    expect(await verifyMcpToken(req, '')).toBeUndefined();
  });
});
