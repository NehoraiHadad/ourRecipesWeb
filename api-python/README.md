# api-python — Telegram history reads

The one place Telethon still lives (ARCHITECTURE §4.6).

Postgres is the source of truth; the Bot API webhook
(`/api/webhooks/telegram` in the Next app) is the real-time input path for the
**old** channel — the sole intake since Wave 5. The Bot API cannot read
**channel history** — it simply cannot see messages posted before the bot
joined, and there is no long-lived server left to poll. That is this
function's entire job:

| Endpoint | Purpose |
|---|---|
| `POST /reconcile` | Scan the last N old-channel messages, ingest whatever the DB is missing. Daily safety net at the default caps; the full history rebuild at raised caps (see below). |
| `GET /health` | Connects to Telegram and pings the Next internal API. |
| `GET /` | Service info. |

**No database access.** Every write goes to the Next.js internal API, which
runs the same old-channel ingest pipeline (Gemini reformat) the webhook
runs — one ingest implementation, so a gap filled a year late is
indistinguishable from a live post.

**No text-drift detection.** The stored `raw_content` is always Gemini's
reformat of the raw post, so it can never equal the channel text byte-for-byte.
"A row exists under this `source_message_id`" is the only signal `/reconcile`
uses — an existing row is left alone. Channel *edits* to an already-tracked
message are the webhook's job (`edited_channel_post`), not this endpoint's.

## Auth

`/reconcile` requires:

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
| `TELEGRAM_OLD_CHANNEL_ID` | Old channel, `-100…` form — the sole intake |
| `NEXT_BASE_URL` | Base URL of the Next app, e.g. `https://ourrecipes.vercel.app` |
| `INTERNAL_API_SECRET` | Shared secret; must match the Next app's value |

Optional: `TELEGRAM_OLD_CHANNEL_URL` (fallback for channel resolution),
`RECONCILE_LIMIT`, `RECONCILE_INGEST_LIMIT`, `HTTP_TIMEOUT_SECONDS`, `PORT`,
`ENVIRONMENT`, `LOG_LEVEL`.

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

## One-time full rebuild

Wave 5.6: wipe the `recipes` table (cascades favorites, versions, and every
saved menu's courses — a deliberate, user-approved trade for giving every
recipe a `source_message_id`), then re-run the *entire* old-channel history
through this same reconcile endpoint with both caps raised so nothing is left
for a "next run":

```bash
curl -X POST "$BASE/reconcile" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"limit": 200000, "ingest_limit": 200000}'
```

Every message in the channel's history goes through the Gemini reformat
pipeline and lands with `{source_channel: "old", source_message_id}` and
`created_at` set to the original post date. Do this **locally, via
docker-compose** if available, not on Vercel: each ingested message is a
Gemini call, so a channel of any real size will run past Vercel's function
duration limits, and Vercel bills per invocation minute. Re-running is safe —
`/reconcile` only acts on messages the DB doesn't have yet — but a message
that failed mid-run (logged under `failed`, not `deferred`) needs the run
repeated to pick it up.
