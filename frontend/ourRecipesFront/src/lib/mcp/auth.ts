/**
 * Shared-key auth for the MCP route (`/api/mcp`).
 *
 * One static bearer key (`MCP_SHARED_KEY`) distributed privately to the
 * family. Kept out of the route file so it can be unit-tested — Next.js
 * route modules may only export HTTP handlers.
 */
import { timingSafeEqual } from 'node:crypto';
import type { AuthInfo } from '@modelcontextprotocol/server';

function keysMatch(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  const expected = process.env.MCP_SHARED_KEY;
  // Fail closed: an unconfigured key must never mean an open server.
  if (!expected || !bearerToken || !keysMatch(bearerToken, expected)) return undefined;

  return { token: bearerToken, scopes: ['recipes:read'], clientId: 'family-shared-key' };
}
