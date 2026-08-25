# Read-only MCP server for AI agents

External AI agents (Claude, ChatGPT, Cursor, …) can search the family recipe
database through an MCP server hosted in the same Next.js app.

## Surface

- **Endpoint**: `https://recipes.nehoraihadad.com/api/mcp`
  ([src/app/api/mcp/route.ts](../frontend/ourRecipesFront/src/app/api/mcp/route.ts))
- **Transport**: Streamable HTTP, stateless (`mcp-handler` 2.x — no Redis, no
  sessions, no SSE).
- **Auth**: one static shared key, `MCP_SHARED_KEY`, checked with
  `timingSafeEqual` in [src/lib/mcp/auth.ts](../frontend/ourRecipesFront/src/lib/mcp/auth.ts).
  Fails closed when the env var is unset. The route is exempted from the JWT
  middleware (`PUBLIC_PATHS` in `src/middleware.ts`); the bearer check is its
  entire authentication. The key is distributed privately to the family —
  never committed, never rendered on any page.

## Tools ([src/lib/mcp/tools.ts](../frontend/ourRecipesFront/src/lib/mcp/tools.ts))

| Tool | What it does |
| --- | --- |
| `search_recipes` | query / categories (OR) / difficulty (EASY, MEDIUM, HARD) / max_total_time / limit ≤ 40 |
| `get_recipe_details` | ingredients + instructions preview for ≤ 25 ids |
| `list_categories` | category → recipe-count aggregation |

The first two reuse the menu agent's executors (`@/lib/ai/menu/tools`), so the
MCP surface is scoped exactly like the planner: `status: 'ACTIVE'`,
`is_parsed: true`. Results are enriched with a `url` per recipe
(`/recipe/<telegram_id>` — the pages are keyed by telegram id, not the
internal id).

## Discoverability & onboarding

- [public/llms.txt](../frontend/ourRecipesFront/public/llms.txt) — public
  agent-discovery file (no key inside).
- `/ai` page ([src/app/(main)/ai/page.tsx](<../frontend/ourRecipesFront/src/app/(main)/ai/page.tsx>)) —
  Hebrew, public, no auth guard: the link to send family together with the key.
  Covers Claude Code, JSON `mcpServers` config, and the `mcp-remote` bridge.
- `.claude/skills/our-recipes/SKILL.md` — skill teaching an agent the search →
  details → menu-building workflow against this server.

## Operations

- Env var: `MCP_SHARED_KEY` (generate: `openssl rand -hex 32`), set in Vercel
  as a Sensitive variable. Rotating the key = updating the var + telling the
  family; nothing else changes.
- Without the header, or with a wrong key, the route returns 401
  (`WWW-Authenticate: Bearer`); no tool ever runs.
- Tests: `tests/unit/lib/mcp/auth.test.ts`, `tests/unit/lib/mcp/tools.test.ts`.
