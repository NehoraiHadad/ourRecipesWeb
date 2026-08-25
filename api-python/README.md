# api-python — Telegram history reads

The one place Telethon still lives (ARCHITECTURE §4.6).

Postgres is the source of truth; the Bot API webhook
(`/api/webhooks/telegram` in the Next app) is the real-time input path. Neither
can read **channel history** — the Bot API simply cannot see messages posted
before the bot joined, and there is no long-lived server left to poll. That is
this function's entire job:

| Endpoint | Purpose |
|---|---|
| `POST /reconcile` | Daily safety net: re-check the last N channel messages, upsert anything the DB is missing or has stale, then ask Next to retry failed outgoing mirrors. |
| `POST /import-history` | One-time backfill of the whole channel, one page per call. |
| `GET /health` | Connects to Telegram and pings the Next internal API. |
| `GET /` | Service info. |

**No database access.** Every write goes to the Next.js internal API, which runs
the same `ingestRecipeMessage` the webhook runs — one ingest implementation, so
a gap filled a year late is indistinguishable from a live post.

## Auth

`/reconcile` and `/import-history` require:

```
Authorization: Bearer <INTERNAL_API_SECRET>
```

The same secret is used to call Next's `/api/internal/*`. `GET /health` and
`GET /` are unauthenticated (they expose no data).

## Environment

Copy `.env.example` to `.env`. Required:

| Variable | Meaning |
|---|---|
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | MTProto app credentials from my.telegram.org |
| `SESSION_STRING` | Telethon `StringSession` for an account that is a member of the channel |
| `TELEGRAM_CHANNEL_ID` | Main channel, `-100…` form |
| `NEXT_BASE_URL` | Base URL of the Next app, e.g. `https://ourrecipes.vercel.app` |
| `INTERNAL_API_SECRET` | Shared secret; must match the Next app's value |

Optional: `TELEGRAM_CHANNEL_URL` (fallback for channel resolution),
`RECONCILE_LIMIT`, `IMPORT_LIMIT`, `MAX_PHOTO_BYTES`, `HTTP_TIMEOUT_SECONDS`,
`PORT`, `ENVIRONMENT`, `LOG_LEVEL`.

### Generating a `SESSION_STRING`

```python
from telethon.sync import TelegramClient
from telethon.sessions import StringSession

with TelegramClient(StringSession(), API_ID, API_HASH) as client:
    print(client.session.save())
```

## Run locally

```bash
cd api-python
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # then fill it in
uvicorn main:app --reload --port 8000
```

Smoke test:

```bash
curl localhost:8000/health

curl -X POST localhost:8000/reconcile \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"limit": 20}'
```

## Deploy to Vercel

This directory is a self-contained Vercel project:

```bash
cd api-python
vercel deploy --prod
```

`api/index.py` is the entry point Vercel's Python runtime picks up; the
`rewrites` in `vercel.json` route every path into the FastAPI app, so
`POST /reconcile` works against the deployment root. `main.py` exposes the same
`app` object for local `uvicorn`.

Set the environment variables above in the Vercel project settings, then point
the Next app's `PYTHON_RECONCILE_URL` at this deployment (either the base URL or
the full `…/reconcile` URL — the cron route accepts both). Running this locally
instead of deploying it is fully supported: leave `PYTHON_RECONCILE_URL` unset
and the daily cron simply skips the history pass.

## One-time history import

`/import-history` pages from the newest message backwards. Feed each response's
`next_offset_id` back in until `has_more` is false:

```bash
OFFSET=0
while :; do
  RESPONSE=$(curl -sS -X POST "$BASE/import-history" \
    -H "Authorization: Bearer $INTERNAL_API_SECRET" \
    -H 'Content-Type: application/json' \
    -d "{\"offset_id\": $OFFSET, \"limit\": 100}")
  echo "$RESPONSE"
  [ "$(echo "$RESPONSE" | jq -r .has_more)" = "true" ] || break
  OFFSET=$(echo "$RESPONSE" | jq -r .next_offset_id)
done
```

Every upsert is idempotent, so a re-run — or a page replayed after a timeout —
changes nothing.

### Photos

Telethon file references are MTProto-only and the Bot API cannot resolve them,
so photos are downloaded here, base64-encoded into the upsert payload, and
stored to Vercel Blob by the Next route. Images above `MAX_PHOTO_BYTES` (5MB by
default) are skipped — the recipe text still lands. `/reconcile` fetches photos
only for messages missing from the DB, since re-uploading on every text edit
would be pure waste.
