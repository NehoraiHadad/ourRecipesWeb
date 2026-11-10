# Our Recipes

אפליקציית ניהול מתכונים משפחתית בעברית, הניזונה מערוץ טלגרם אחד.

Our Recipes is a Hebrew-first family recipe management app fed by a single
Telegram channel: free-text recipes posted (or edited) there are reformatted by
AI and appear in the app within seconds. The database is the source of truth;
the channel is the family's input surface.

## Demo

![Home Page](demo/2.png)

![Recipe Search](demo/5.png)

![Meal Suggestion](demo/1.png)

![Recipe Details](demo/4.png)

![Recipe List](demo/3.png)

## Architecture

Full details: [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md)
(implementation plan: [docs/architecture/IMPLEMENTATION_PLAN.md](docs/architecture/IMPLEMENTATION_PLAN.md)).

- **Next.js on Vercel** (`frontend/ourRecipesFront/`) — the UI **and** the entire API
  (App Router routes under `src/app/api`): recipes, menus, places, auth, AI features.
- **Managed PostgreSQL** (Neon / Supabase / Vercel Postgres) — the single source of
  truth, accessed via Prisma. Telegram is an input/display surface, not the memory
  of the system.
- **Telegram Bot API webhook** (`POST /api/webhooks/telegram`) — channel posts and
  edits are pushed into the app; no polling, no long-lived server.
- **App-authored content** — recipes created in the app live in the DB only;
  nothing is written back to Telegram.
- **`api-python/`** — a small FastAPI + Telethon service used only for history
  import/rebuild and periodic reconcile (Bot API cannot read channel history).
  Triggered by Vercel Cron via `/api/cron/reconcile`.
- **AI** — Gemini (recipe formatting, suggestions, menu planning, images).
- **Images** — Vercel Blob; the DB stores URLs only.
- **Auth** — Telegram Login Widget → JWT (httpOnly cookie, `jose`), edit
  permissions derived from channel admin rights via `getChatMember`.

## Local Development

Prerequisites: Node.js 24.x, Docker (for local Postgres).

```bash
# 1. Start a local Postgres
docker compose up -d postgres

# 2. Install and configure the app
cd frontend/ourRecipesFront
npm install
cp .env.example .env.local   # fill in the values (see ARCHITECTURE.md §7)

# 3. Create the schema
npm run prisma:push

# 4. Run
npm run dev                  # serves on port 80
```

Tests and build:

```bash
npm run test:run   # vitest (live PostgreSQL push tests opt in separately)
npm run build      # prisma generate + next build
```

Environment variables are listed in
[ARCHITECTURE.md §7](docs/architecture/ARCHITECTURE.md) and
`frontend/ourRecipesFront/.env.example`. Deployment and one-time setup steps
(webhook registration, history import) live in
[docs/architecture/DEPLOYMENT.md](docs/architecture/DEPLOYMENT.md).

## Cooking timers and voice guidance

- Timers start immediately and store an absolute end time in IndexedDB. Returning
  from a locked screen or reopening the app restores the correct remaining time;
  overdue timers notify once on return. Pausing stores the remaining duration.
- Optional server-scheduled Web Push sends a notification without keeping the page
  running. It uses PostgreSQL, Vercel Workflows and the browser's push service.
  It needs network connectivity and notification permission; delivery can be delayed
  by the network or OS. On iOS 16.4+, open the app from the Home Screen first.
  Deployment, opt-in and verification steps are in
  [TIMER_PUSH.md](frontend/ourRecipesFront/docs/TIMER_PUSH.md).
- Native Android/iOS projects and an OS-scheduled notification adapter are now
  available, along with a bundled offline timer verification client. Build/device
  instructions, the plan for packaging the full Next.js recipe client, and platform
  limits are in [mobile/README.md](frontend/ourRecipesFront/mobile/README.md).
- Structured recipes offer Hebrew narration one instruction line at a time.
  Enable the microphone to use commands such as “שמתי קמח, מה עכשיו?”,
  “חזור על השלב”, “השלב הקודם”, “מההתחלה”, and “עצור”. Each next command advances
  one step in recipe order; this is navigation, not an AI ingredient Q&A.
- Speech synthesis needs browser support and a Hebrew voice on the device.
  Recognition uses `SpeechRecognition`/`webkitSpeechRecognition` with `he-IL`, may
  use the browser vendor's online service, and requires microphone permission.
  Listening pauses during narration and stops when the page is hidden or closed.
  Buttons remain available when speech APIs are unsupported.

## Repository Layout

| Path | Role |
|------|------|
| `frontend/ourRecipesFront/` | Next.js app — UI + all API routes |
| `api-python/` | FastAPI + Telethon: history import & reconcile |
| `docs/architecture/` | Architecture, implementation plan, deployment guide |
| `demo/` | Screenshots |

## License

See [LICENSE](LICENSE).
