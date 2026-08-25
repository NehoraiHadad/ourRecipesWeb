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
| Recipe images | KIE `gpt-image-2-text-to-image` (2K, 3:2) — user decision 2026-08-25; nano-banana family stays as env fallback |
| Infographics | KIE `gpt-image-2-text-to-image` (2K, 2:3) — user decision; Hebrew rendering verified with a real API call (excellent). Direct Gemini stays as fallback |
| Generated media | Uploaded to Vercel Blob server-side immediately (KIE retains media 14 days only); routes return Blob URLs, not data URIs |
| LLM via KIE | No — LLM calls stay direct to Google (structured-output/function-calling fidelity) |
| Env | `KIE_API_KEY` (already in Vercel), keep `GOOGLE_API_KEY` + `GOOGLE_API_KEY_NANO_BANANA`, delete `HUGGINGFACE_TOKEN` |
| Auth | Already enforced globally by `src/middleware.ts` (JWT on all `/api/**`) — no per-route auth work needed |

Resolved 2026-08-25 (user decisions):
- Images: GPT Image 2 for both photos and infographics — verified live: Hebrew infographic rendered near-perfectly (~85s generation, inside maxDuration=120).
- LLMs: per-task model registry (`getModelFor(task)` in `src/lib/ai/gemini/models.ts`), every task overridable via `AI_MODEL_<TASK>` env.
Open follow-ups: LLM Hebrew A/B (3.7-flash vs GPT-5.6 vs Sonnet 5) via the env dials, optional Opus 5 for menus if Gemini Pro feels shallow.

## Wave plan

| Wave | Agent | Model | Scope | Status |
|---|---|---|---|---|
| 1 | kie-infra | Sonnet | `src/lib/ai/kie/` client + poll + media→Blob helper + unit tests | [x] done |
| 1 | gemini-infra | Sonnet | `src/lib/ai/gemini/` wrapper (lazy init, retry/timeout), migrate text functions to `gemini-3.7-flash`, `maxDuration` on text routes | [x] done |
| 2 | image-routes | Sonnet | generate-image + generate-infographic → KIE + Blob, delete HF/SDXL code, UI contract update | [x] done |
| 2 | menu-agent | Opus | menuPlannerService rewrite as real agent (`gemini-3.1-pro-preview`), fix `ai_reason` bug, tests | [x] done |
| 3 | (main) | — | Integration: tsc + vitest + build green, docs, final commit | [x] done |

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
- [x] `generateRecipeImage` → KIE `nano-banana-2` 2K; Hebrew-aware prompt (title passed as-is, no regex-and-'dish' fallback); delete HuggingFace code path
- [x] `generateRecipeInfographic` → KIE `nano-banana-pro`; fallback to direct Gemini when KIE fails
- [x] Both routes upload to Blob server-side and return `{ image_url }`; `maxDuration = 120`
- [x] UI: `RecipeImageField` + `RecipeInfographic` consume URL instead of data URI (infographic download keeps working)
- [x] Remove `HUGGINGFACE_TOKEN` from `.env.example`; document `KIE_API_KEY`
- [x] Tests: route tests updated; KIE client mocked

### 2B. Menu agent rewrite
- [x] Replace catalog-dump tools with SQL-filtered search: `search_recipes({query?, categories?, dietary?, max_time?, limit})`, `get_recipes_details(ids)` (capped, ACTIVE+parsed only), `review_menu_draft(draft)` returning balance feedback
- [x] Agent loop on `gemini-3.1-pro-preview`: handle **all** `functionCalls` per turn, iteration cap, retry on transient errors
- [x] Final output via `responseSchema` (typed `MenuPlan`) — no regex JSON extraction
- [x] Fix `ai_reason` contract bug (prompt says `ai_reason`, save route read `reason`)
- [x] Type the whole path (`MenuPlan`, `MealPlan`, no `any`)
- [x] Tests: agent loop with mocked chat (tool dispatch, multi-call turns, schema validation), generate-preview route test

## Wave 3 — Integration
- [x] `npx tsc --noEmit` clean
- [x] `npm test` green 
- [x] `npm run build` succeeds
- [x] Update this file + `DEPLOYMENT_TASKS.md`
- [x] Final commit (code committed locally; **push/deploy awaits explicit user approval** per Vercel guardrail — though note production AI is currently broken, so deploying is the fix)

## Completion notes (Wave 2/3)
- `menuPlannerService.ts` deleted outright — the agent lives in `src/lib/ai/menu/` (11 small modules), route imports updated, `menuService.ts` client typed with `MenuPlan` (type-only import).
- `review_menu_draft` gives the model deterministic Hebrew feedback (missing main course, duplicates, ingredient overlap) so it can iterate before finalizing.
- Finalize is a separate `responseSchema` call — Gemini rejects a response schema on a request that also declares tools.
- Extra fix beyond plan: `mirrorCreateRecipe` now accepts a photo URL, so AI-generated (Blob-hosted) images attach to the Telegram mirror on create; edits/reconcile already used URLs.
- Final state: tsc clean, 498/498 tests, production build succeeds. Code committed locally, NOT pushed.

## Verification notes
- Production breakage verified 2026-08-25 via guest JWT → `POST /api/recipes/reformat` → 500.
- Auth model verified: `src/middleware.ts` enforces JWT on all `/api/**`; guest JWTs pass. Rate limiting still absent (acceptable for now).
- Local `.env.local` has no `GOOGLE_API_KEY`/`KIE_API_KEY` — tests must mock providers; smoke tests against real APIs need `vercel env pull` or manual paste.
