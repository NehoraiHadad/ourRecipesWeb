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
- LLMs — hybrid, decided after a two-round A/B on 4 real recipes (reports in session scratchpad):
  round 1 (Gemini-style prompt): Luna polluted output with Markdown; round 2 (GPT-adapted prompt with
  a no-Markdown instructions block + delimiters + low reasoning effort): Luna matched Gemini's format
  discipline, was more faithful to source wording, and ~3x cheaper on KIE credits. Approved hybrid:
  reformat/suggest/refine on `kie:gpt-5-6-luna` (KIE codex chat endpoint, Codex system prompt overridden
  via `instructions`, auto-fallback to `gemini-3.7-flash` on any KIE failure); optimize_steps on
  `kie:gemini-3-7-flash` (see post-deploy hotfix below); menu_agent stays `gemini:gemini-3.1-pro-preview`
  (function calling + finalize responseSchema). Registry moved to `src/lib/ai/models.ts`, returns
  `{provider, model}`, env overrides use `provider:model` format. Future experiment noted by user:
  moving the menu agent to a cheaper model via KIE once its endpoints prove out.

Post-deploy hotfix 2026-08-25 — optimize-steps 504 in production:
- Symptom: `POST /api/recipes/optimize-steps` → 504 FUNCTION_INVOCATION_TIMEOUT at 60s, right after the hybrid deploy.
- Root cause (from Vercel runtime logs): direct Google API overload — attempt 0 aborted at the 45s
  per-attempt retry timeout, attempt 1 got a 503 from Google, function killed at maxDuration=60.
  NOT a prompt/schema problem: the same model + full `OPTIMIZED_STEPS_SCHEMA` through KIE's Gemini
  proxy answered in 6–7s during the outage.
- Fix: optimize_steps default moved to `kie:gemini-3-7-flash` via new `src/lib/ai/kie/geminiJson.ts`
  (KIE's native Gemini endpoint, supports responseSchema; model ids use dashes). Falls back to direct
  Gemini on any KIE throw, with `thinkingConfig: LOW` (dynamic thinking alone added ~5s / ~900 tokens);
  route `maxDuration` raised to 120 so the fallback's two 45s retry attempts fit.
  Verified in production: 200 in 9s with a full 4-group plan.

Post-deploy hotfix 2 2026-08-25 — menu agent 500 in production:
- Symptom: `POST /api/menus/generate-preview` → 500 after 3s.
- Root cause (runtime logs): the production GOOGLE_API_KEY is FREE TIER, and `gemini-3.1-pro` has
  free-tier quota limit **0** — every call 429s with RESOURCE_EXHAUSTED. The menu agent model was
  never usable with this key; earlier optimize-steps flakiness was the same free-tier key.
- Fix (the user's own suggested direction, made mandatory): the whole agent runs through KIE's
  Gemini proxy. `gemini/client.ts#getGeminiVia('kie')` points the @google/genai SDK at
  `https://api.kie.ai/gemini` (v1, Bearer auth) — multi-turn function calling passes through the
  proxy unchanged (probed live before committing). KIE's native surface only carries the flash
  family (pro ids 404 there; pro exists only on a separate OpenAI-compatible surface), so
  menu_agent defaults to `kie:gemini-3-7-flash`; finalize routes through `kieGeminiJson` with
  direct-Gemini fallback. Local end-to-end run: 8 tool iterations, 94.8s, 5-course Shabbat plan,
  every course with a rich Hebrew `ai_reason`; finalize cost 0.16 KIE credits.
- If menu quality on flash disappoints: the pro model is reachable via KIE's OpenAI-compatible
  endpoint (`/gemini-3.1-pro/v1/chat/completions`, supports OpenAI-format tools) — a bigger
  conversion, or upgrade the Google key to a paid tier and set `AI_MODEL_MENU_AGENT=gemini:...`.
- Hardening that followed (prod agent sessions showed high latency variance through KIE from
  fra1 — measured 64s / 102s / 120s+ for the same request): route `maxDuration` 120→300 and
  client timeout 120s→240s; agent turns get a 75s per-attempt retry budget (was 45s — turns were
  aborted mid-generation and retried from scratch); an empty final model turn (KIE occasionally
  answers HTTP 200 with no candidates under load) gets one tool-less nudge for the summary
  instead of failing the session with 'הסוכן לא הפיק תפריט'.
- Final production verification 2026-08-25: optimize-steps 200 in ~6s; generate-preview 200 in
  102s — 1 meal, 3 courses, every course with a Hebrew `ai_reason`.

JSON-first refactor 2026-08-26 (user decision: "כל המודלים המודרניים יודעים להחזיר מבנה נדרש"):
- Trigger: AI-generated recipes came back with emoji templates + label synonyms that the channel
  parser missed (`is_parsed: false`, recipes excluded from menu planner / MCP). Root fix: stop
  asking models for free text at all.
- All four text tasks now use JSON-schema structured output. New contract module
  `src/lib/recipes/recipeJson.ts`: `RECIPE_JSON_SCHEMA` (Gemini `Schema` form, authored once),
  `parseRecipeJson` (validation/normalization; null on missing essentials), and
  `recipeJsonToChannelText` (canonical channel text via `formatRecipeText` + numbered steps +
  a trailing `טיפים:` section that the parser deliberately keeps out of instructions). AI
  recipe text is guaranteed to round-trip `parseRecipeMessage` with `is_parsed: true`.
- KIE surface discovery (verified empirically — undocumented in KIE's docs): the codex
  `/responses` endpoint passes OpenAI's `text.format` json_schema through, and strict mode is
  enforced on `gpt-5-6-luna`. So the recipe tasks KEEP Luna (Hebrew prose quality, the round-2
  A/B winner) and gain structured output: `kieChatText` accepts an optional `schema`, and
  `src/lib/ai/kie/schema.ts#toStrictJsonSchema` derives the strict JSON Schema from the Gemini
  form (all-required + additionalProperties:false; `parseRecipeJson` stays the arbiter of what
  is actually optional).
- `textTasks.ts` unified on one `generateTaskJson(task, prompt, schema)`: a `kie:` assignment
  picks its surface by model family (GPT ids → codex proxy, Gemini ids → native Gemini proxy),
  any KIE throw falls back to direct Gemini structured output at `GEMINI_TEXT_FALLBACK_MODEL`
  with LOW thinking. Task signatures unchanged (`Promise<string>` of channel text) — routes,
  bulk reformat and UI untouched. `kie/chatPrompts.ts` (per-task chat prompt splitting) deleted;
  prompts in `gemini/prompts.ts` rewritten schema-first (one builder per task, shared rules).
- Live E2E before deploy: Luna + strict `RECIPE_JSON_SCHEMA` → valid JSON → canonical text →
  `parseRecipeMessage` round-trip `isParsed: true`, 0 errors (420 output tokens).

Menu preview contract 2026-08-26 — every previewed course rendered "מתכון לא זמין":
- Symptom (user report): the AI menu preview showed the course type and the Hebrew `ai_reason`
  for each dish, but never a title — so there was no way to tell which recipes were chosen.
- Root cause was structural, not a missing field: `POST /api/menus/generate-preview` handed the
  client the agent's internal `MenuPlan` (bare `recipe_id`s — all it needs to reason and all the
  save route consumes), while the UI renders a preview exactly like a saved menu, off the
  embedded `recipe` summary that Prisma's `menuMealsInclude` provides. Two shapes for one
  concept, and `MenuGenerator`'s `menuPreview` was typed `any`, so nothing caught the drift.
  The duplicated course-row markup in `MenuGenerator` and `MenuDisplay` is what let the two
  diverge silently — same fallback string in both copies.
- Fix (contract + component, not a patch): `PlannedCourse` in `src/types` is now the single
  definition of a course (saved `MealRecipe` extends it), `MenuPreview` is the wire contract and
  carries the saved menu's field names (`ai_reasoning`, not `reasoning`); `src/lib/menus/
  menuPreview.ts#buildMenuPreview` converts plan → preview with one query using the same
  `recipeSummarySelect` saved menus use, so `MenuPlan` never crosses the wire. Both screens now
  render `components/menu/MealCourseCard` — one copy of the row, one fallback string. Preview
  rows became clickable too (new tab, so the unsaved preview survives).
- The save route accepts `ai_reasoning ?? reasoning` so a preview generated before the deploy
  can still be saved after it.

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

---

# Wave 4 — Deletion & recipe visibility (2026-08-26)

Trigger: a deleted recipe ("חדש" — a one-word test message) turned up as a
course in a generated menu.

## Root cause (verified against production data, not inferred)
- The row is `id=1, telegram_id=531, status=ARCHIVED, is_parsed=false`.
  **Deletion worked.** The agent's search tools filter `ACTIVE + is_parsed`, so
  they could not have returned it.
- Nothing validated ids in the agent's *output*: `parseMenuPlan` checks shape
  only, and the finalize call can emit an id no tool ever returned. Recipe ids
  are small dense integers, so an invented one (`1`) hits a real row —
  `buildMenuPreview` then resolved it with no filter and rendered its title.

## Done
- [x] `lib/recipes/visibility.ts` — `VISIBLE_RECIPE`, `PLANNABLE_RECIPE`, and the
      status constants. One definition; `lib/ai/menu/filters.ts` deleted.
- [x] `lib/places/visibility.ts` — `VISIBLE_PLACE`, the same shape for places.
- [x] `PLANNABLE_RECIPE` gates the three write paths that take an outside
      `recipe_id`: `buildMenuPreview`, menu save, add-recipe-to-meal.
- [x] `VISIBLE_RECIPE` applied to every leaking read path: recipe
      GET/PUT/DELETE by telegram_id, versions list + restore, bulk reparse,
      categories, search, suggestions, `mirrorPending`.
- [x] Dead `DELETED` value dropped from the `RecipeStatus` enum.
- [x] Regression tests: preview resolves through `PLANNABLE_RECIPE`; delete
      looks up through `VISIBLE_RECIPE`. 556/556 green, tsc clean.
- [x] ARCHITECTURE §4.4 documents the soft-delete contract per entity.

## Open — needs a decision, not just code
- [ ] **89 of 203 ACTIVE recipes are `is_parsed: false`**, so the agent plans
      from 114. Backfill dry run rescues **0** of them (`false -> true: 0`) —
      they never had the labeled structure. 48 of the 89 are under 40 chars
      ("פסח", "נודלס", "חומוס") and *should* stay invisible; ~41 are real
      free-text recipes that only an AI reformat pass can rescue
      (`POST /api/recipes/bulk` `action: 'parse'`, ~41 AI calls).
- [ ] **`dietary_type` is never enforced** — it reaches the agent as prose only.
      No filter, no review check. A meat menu can get a dairy dessert: a
      kashrut error, the worst failure mode this app has. The mapping already
      exists inline in the replacement-suggestions route; extract it and apply
      it in `searchWhere` + `review`.
- [ ] Course type unenforced the same way (a cake can be the main course).
- [ ] `reviewMenuDraft` never sees `MenuPreferences`, so a requested meal can be
      silently dropped and `servings` is never checked against the recipes.
- [ ] `search_recipes` logs counts, not ids — so "did the model invent this id?"
      cannot be answered from logs. Cheapest high-value observability change.
- [ ] Places have no ownership check on update/delete (ported from Flask
      as-is). Menus do. Deliberate or an oversight? — user decision.

---

# Wave 5 — One channel, one source (2026-08-26)

Plan doc: claude.ai artifact `43ffdc58` ("ערוץ אחד, מקור אחד"). The main channel
(`TELEGRAM_CHANNEL_ID`) was the pre-DB database; Postgres replaced it, so every
*write* to it goes away. The old channel (`TELEGRAM_OLD_CHANNEL_ID`) stays the
sole intake. Root fix: `republishOldChannelPost` starts *storing*
`sourceMessageId` instead of only logging it — which both frees `telegram_id`
from double duty (channel pointer + public URL key) and makes old-channel edits
attributable to a row.

## Decisions (user-approved 2026-08-26)
1. `telegram_id` stays the `/recipe/<id>` URL key. No redirect layer. New
   recipes draw from the internal negative-id sequence
   (`generatePendingTelegramId` pattern — the UI already tolerates negative ids).
2. Edit conflicts: the channel wins, but a row that was app-edited since its
   last channel ingest gets `needs_review = true`, surfaced in `/manage`.
3. ~~No source recovery for the 203 pre-existing recipes.~~ **Superseded
   (user decision 2026-08-26, after an explicit data-loss warning): wipe all
   recipe rows and rebuild the entire collection from the old channel's
   history.** The wipe cascades user favorites, versions, and every saved
   menu's courses, and discards app-side edits, AI images, and the old shared
   `/recipe/<id>` links — accepted. In exchange, every recipe carries
   `source_message_id`, so old-channel edit detection covers the whole
   collection and the Python reconcile needs no cutover guard: steady state is
   simply "match old-channel history by source id, ingest the misses".

## Deviations from the plan doc (verified against code)
- `telegram_id` stays `Int @unique` **NOT NULL** (plan sketched `Int?`) — every
  row always receives a value (real legacy id or generated), and nullability
  would ripple null-checks through every serializer for nothing.
- Decision 2 needs storage: `needs_review Boolean @default(false)` +
  `app_edited_at DateTime?` (set by app edit paths, consumed by the webhook
  edit path). Explicit columns beat deriving "app-edited" from
  `updated_at`/version rows.
- This project has **no prisma migrations folder** — schema changes apply via
  `prisma db push` (additive columns only; nothing dropped: `sync_status`,
  `sync_error`, `Menu.telegram_message_id`, `Place.*` stay as dormant columns).
- The Python reconcile repoint is not just an env change: it must match
  old-channel messages by `source_message_id` (not `telegram_id`) and ingest
  misses through the old-channel pipeline (Gemini reformat — a new internal
  route, since `/api/internal/recipes/upsert` deliberately excludes the AI
  SDK). The full rebuild (decision 3) makes this the steady state from day
  one — no cutover guard needed, since no row predates source tracking.
- With the main-channel webhook branch gone, channel-side intake of *places*
  ("המלצה" posts) and the menu-mirror skip logic die with it (`channelIngest.ts`,
  `places/ingest.ts`); places become app-authored only. `Place.is_synced`
  freezes as historical data.
- `checkEditPermission` must repoint to `TELEGRAM_OLD_CHANNEL_ID` **before**
  the Telegram channel is deleted; operational prereq: the bot must be an admin
  of the old channel first.

## Stages (each stage = one commit, system deployable after each)
- [ ] **5.1 Schema** — add `source_channel` (`@default("app")`),
      `source_message_id`, `@@unique([source_channel, source_message_id])`,
      `needs_review`, `app_edited_at`. Zero behavior change. `prisma db push`.
- [ ] **5.2 Intake stores source** — `ingestRecipeMessage` accepts
      `{sourceChannel, sourceMessageId}` (create sets them; update never
      clobbers them); `republishOldChannelPost` passes them while still
      publishing to the main channel.
- [ ] **5.3 Old-channel edit detection** — webhook `edited_channel_post` from
      the old channel: lookup `{source_channel:'old', source_message_id}`;
      miss → treat as new post; hit → `reformatRecipe` + `snapshotVersion` +
      row update, `needs_review = true` if `app_edited_at` is set. App edit
      paths (update, version restore) start setting `app_edited_at`.
- [ ] **5.4 Mirror disconnect** — delete `mirror.ts`, `mirrorPending.ts`,
      `menuMirror.ts`, `placeMirror.ts`, `api/internal/mirror-pending`;
      old-channel intake ingests directly under a generated internal id (no
      more publish); webhook main-channel branch + `channelIngest.ts` removed;
      `deleteRecipe` = row update only; reconcile loses its mirror phase;
      `bulkParse` drops `mirrorEditRecipe` and raises `CONCURRENCY`;
      `sync_status`/`sync_error` writers removed; create/update/restore routes
      simplified; `generatePendingTelegramId` moves out of `mirror.ts`;
      integration tests rewritten.
- [ ] **5.5 Repoint & surface** — `permissions.ts` → old channel; `/manage`
      shows a `needs_review` badge (+ clear on app edit); api-python: reconcile
      reads the old channel, drops `mirror_pending`, matches by
      `source_message_id`, calls the new internal old-channel ingest route;
      docs + `.env.example` + README updated (ARCHITECTURE §4.1, §4.3, §4.4,
      §4.6, §7).
- [ ] **5.6 Wipe & rebuild (operational, after deploy, with explicit user
      go-ahead at execution time)** — truncate `recipes` (cascades favorites /
      versions / menu courses), then run the full old-channel history import:
      Telethon reads every message, each one goes through the reformat
      pipeline and lands with `{source_channel:'old', source_message_id}` and
      `created_at` = original post date.
- [ ] **5.7 (user, not code)** — delete the main channel in Telegram. Prereq
      checklist: bot admin in the old channel, permissions deploy verified,
      rebuild verified.
