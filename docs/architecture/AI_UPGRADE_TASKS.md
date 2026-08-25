# AI Upgrade Tasks

> Execution plan for the AI model + infrastructure upgrade (2026-08-25).
> Inputs: `AI_MODELS_RESEARCH.md` (model decisions), `KIE_INTEGRATION_RESEARCH.md` (KIE contract),
> and the AI code map produced in-session.
> **Urgency**: production AI routes are broken right now — `gemini-2.0-flash-exp` was shut down
> on 2026-06-01 (verified: `POST /api/recipes/reformat` returns 500 in production with a valid guest JWT).

## Decisions (locked)

| Area | Decision |
|---|---|
| Text tasks (reformat / suggest / refine / optimize-steps) | `gemini-3.7-flash`, direct `@google/genai` |
| Menu planning | Real agent loop on `gemini-3.1-pro-preview`: SQL-filtered search tools, all function calls handled, final answer via `responseSchema` |
| Recipe images | KIE `nano-banana-2` (2K) replaces HuggingFace SDXL |
| Infographics | KIE `nano-banana-pro` primary; direct Gemini (`GOOGLE_API_KEY_NANO_BANANA`) fallback. Model ids overridable via env — pending a Hebrew side-by-side vs `gpt-image-2` (user leans GPT Image 2) |
| Generated media | Uploaded to Vercel Blob server-side immediately (KIE retains media 14 days only); routes return Blob URLs, not data URIs |
| LLM via KIE | No — LLM calls stay direct to Google (structured-output/function-calling fidelity) |
| Env | `KIE_API_KEY` (already in Vercel), keep `GOOGLE_API_KEY` + `GOOGLE_API_KEY_NANO_BANANA`, delete `HUGGINGFACE_TOKEN` |
| Auth | Already enforced globally by `src/middleware.ts` (JWT on all `/api/**`) — no per-route auth work needed |

Open follow-ups (not in this phase): GPT Image 2 Hebrew side-by-side (4x cheaper if Hebrew renders),
LLM Hebrew A/B (3.7-flash vs GPT-5.6 vs Sonnet 5), optional Opus 5 for menus if Gemini Pro feels shallow.

## Wave plan

| Wave | Agent | Model | Scope | Status |
|---|---|---|---|---|
| 1 | kie-infra | Sonnet | `src/lib/ai/kie/` client + poll + media→Blob helper + unit tests | [x] done |
| 1 | gemini-infra | Sonnet | `src/lib/ai/gemini/` wrapper (lazy init, retry/timeout), migrate text functions to `gemini-3.7-flash`, `maxDuration` on text routes | [x] done |
| 2 | image-routes | Sonnet | generate-image + generate-infographic → KIE + Blob, delete HF/SDXL code, UI contract update | [ ] pending |
| 2 | menu-agent | Opus | menuPlannerService rewrite as real agent (`gemini-3.1-pro-preview`), fix `ai_reason` bug, tests | [ ] pending |
| 3 | (main) | — | Integration: tsc + vitest + build green, docs, final commit | [ ] pending |

## Wave 1 — Infrastructure

### 1A. KIE client (`src/lib/ai/kie/`)
- [x] `types.ts` — task lifecycle types (`CreateTaskResponse`, `RecordInfoResponse`, task states)
- [x] `client.ts` — `createTask(model, input)` / `getTask(taskId)` with Bearer `KIE_API_KEY`, lazy env read, typed error mapping
- [x] `poll.ts` — `pollTask(taskId, {timeoutMs, intervalMs})` with backoff; respects KIE 20 req/10s limit
- [x] `models.ts` — model ids (`nano-banana-2`, `nano-banana-pro`) + per-model input builders
- [x] `src/lib/ai/media.ts` — `storeGeneratedImage(url, keyHint)`: fetch result URL → Vercel Blob (`recipes/…`), returns public URL
- [x] Unit tests (mock `fetch`): create/poll happy path, failure states, timeout, missing env

### 1B. Gemini wrapper (`src/lib/ai/gemini/`)
- [x] `client.ts` — single lazy `GoogleGenAI` instance; throws clearly on missing `GOOGLE_API_KEY` at call time
- [x] `retry.ts` — `withRetry(fn, {retries, timeoutMs})`: backoff on 429/5xx, AbortSignal timeout
- [x] `models.ts` — `GEMINI_TEXT_MODEL = 'gemini-3.7-flash'`, `GEMINI_AGENT_MODEL = 'gemini-3.1-pro-preview'`
- [x] Migrate `aiService.ts` text functions (reformat / suggest / refine / optimize-steps) to the wrapper
- [x] `maxDuration = 60` on reformat / refine / suggest routes (optimize-steps already has it)
- [x] Existing tests stay green (they mock `aiService`)

## Wave 2 — Features

### 2A. Image routes → KIE
- [ ] `generateRecipeImage` → KIE `nano-banana-2` 2K; Hebrew-aware prompt (title passed as-is, no regex-and-'dish' fallback); delete HuggingFace code path
- [ ] `generateRecipeInfographic` → KIE `nano-banana-pro`; fallback to direct Gemini when KIE fails
- [ ] Both routes upload to Blob server-side and return `{ image_url }`; `maxDuration = 120`
- [ ] UI: `RecipeImageField` + `RecipeInfographic` consume URL instead of data URI (infographic download keeps working)
- [ ] Remove `HUGGINGFACE_TOKEN` from `.env.example`; document `KIE_API_KEY`
- [ ] Tests: route tests updated; KIE client mocked

### 2B. Menu agent rewrite
- [ ] Replace catalog-dump tools with SQL-filtered search: `search_recipes({query?, categories?, dietary?, max_time?, limit})`, `get_recipes_details(ids)` (capped, ACTIVE+parsed only), `review_menu_draft(draft)` returning balance feedback
- [ ] Agent loop on `gemini-3.1-pro-preview`: handle **all** `functionCalls` per turn, iteration cap, retry on transient errors
- [ ] Final output via `responseSchema` (typed `MenuPlan`) — no regex JSON extraction
- [ ] Fix `ai_reason` contract bug (prompt says `ai_reason`, save route read `reason`)
- [ ] Type the whole path (`MenuPlan`, `MealPlan`, no `any`)
- [ ] Tests: agent loop with mocked chat (tool dispatch, multi-call turns, schema validation), generate-preview route test

## Wave 3 — Integration
- [ ] `npx tsc --noEmit` clean
- [ ] `npm test` green 
- [ ] `npm run build` succeeds
- [ ] Update this file + `DEPLOYMENT_TASKS.md`
- [ ] Final commit (code committed locally; **push/deploy awaits explicit user approval** per Vercel guardrail — though note production AI is currently broken, so deploying is the fix)

## Verification notes
- Production breakage verified 2026-08-25 via guest JWT → `POST /api/recipes/reformat` → 500.
- Auth model verified: `src/middleware.ts` enforces JWT on all `/api/**`; guest JWTs pass. Rate limiting still absent (acceptable for now).
- Local `.env.local` has no `GOOGLE_API_KEY`/`KIE_API_KEY` — tests must mock providers; smoke tests against real APIs need `vercel env pull` or manual paste.
