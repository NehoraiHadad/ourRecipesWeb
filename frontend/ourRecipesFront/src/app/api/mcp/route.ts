/**
 * POST /api/mcp — read-only MCP server for external AI agents.
 *
 * Streamable HTTP (stateless, `mcp-handler` 2.x — no Redis, no sessions).
 * Protected by a single shared bearer key (`MCP_SHARED_KEY`): the family
 * pastes the URL + key into their agent of choice; there is no OAuth flow.
 * The route is exempted from the JWT middleware (`src/middleware.ts`) —
 * the bearer check in `@/lib/mcp/auth` is its entire authentication.
 *
 * Tools are read-only by construction — see `@/lib/mcp/tools`.
 */
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { verifyMcpToken } from '@/lib/mcp/auth';
import { registerRecipeTools } from '@/lib/mcp/tools';

const handler = createMcpHandler((server) => {
  registerRecipeTools(server);
});

const authHandler = withMcpAuth(handler, verifyMcpToken, { required: true });

export { authHandler as GET, authHandler as POST, authHandler as DELETE };

export const maxDuration = 60;
