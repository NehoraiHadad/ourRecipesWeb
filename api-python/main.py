"""
FastAPI application for Telegram history reads (ARCHITECTURE §4.6).

Postgres is the source of truth and the Bot API webhook is the real-time input
path. This function covers the one thing the Bot API cannot do — **read old
channel history**, including messages that predate the bot — via
``POST /reconcile``: scan the last N old-channel messages and ingest whatever
the DB does not have yet.

It owns no database credentials: every write goes to the Next.js internal API,
which runs the same old-channel ingest pipeline (Gemini reformat) the webhook
runs.

The same endpoint also serves the one-time full history rebuild — raise both
caps and run it once, locally. See the README.

Run locally:      uvicorn main:app --reload --port 8000
Deploy (Vercel):  vercel deploy   (from this directory; api/index.py is the entry)
"""

import base64
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import Depends, FastAPI, HTTPException, Request

from config import logger, settings
from models import HealthResponse, MessageOutcome, ReconcileRequest, ReconcileResponse
from next_client import NextInternalClient
from telegram_client import resolve_channel, telegram_client

app = FastAPI(
    title="Our Recipes — Telegram Reconcile",
    description="Telethon history reads: periodic reconcile of the old channel, and the full rebuild",
    version="2.0.0",
)


# ============================================================================
# Auth
# ============================================================================


async def require_internal_secret(request: Request) -> bool:
    """
    Verify ``Authorization: Bearer <INTERNAL_API_SECRET>``.

    Called by Vercel Cron (through the Next cron route) and by hand. Nothing
    here is public.
    """
    auth_header = request.headers.get("Authorization")

    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid Authorization header format. Expected: Bearer <token>",
        )

    token = auth_header.split(" ", 1)[1]

    if token != settings.INTERNAL_API_SECRET:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    return True


# ============================================================================
# Helpers
# ============================================================================


def message_text(message: Any) -> str:
    """Text of a channel message; Telethon puts a media caption in ``.text`` too."""
    return (getattr(message, "text", None) or "").strip()


def message_epoch_seconds(message: Any) -> Optional[int]:
    """
    Unix-seconds post time, forwarded as the ingest route's ``date`` so
    ``created_at`` on a newly created recipe matches the original post time.
    """
    date = getattr(message, "date", None)
    if not date:
        return None
    if date.tzinfo is None:
        date = date.replace(tzinfo=timezone.utc)
    return int(date.timestamp())


class ChannelPage:
    """One page of old-channel history, newest first."""

    def __init__(self, messages: List[Tuple[Any, str]], scanned: int):
        #: (message, text) for messages worth storing; text may be empty for a
        #: photo-only post (a photographed recipe, completed by hand in the app).
        self.messages = messages
        #: How many messages the iterator yielded, including skipped empty ones.
        self.scanned = scanned


async def fetch_page(client: Any, limit: int) -> ChannelPage:
    """
    Read the last ``limit`` old-channel messages, newest first, skipping only
    messages that carry neither text nor a photo (nothing to store).

    Must be called with a connected client.
    """
    channel = await resolve_channel(client)

    collected: List[Tuple[Any, str]] = []
    scanned = 0

    async for message in client.iter_messages(channel, limit=limit):
        scanned += 1

        text = message_text(message)
        if not text and not getattr(message, "photo", None):
            continue

        collected.append((message, text))

    return ChannelPage(collected, scanned)


async def download_photo_base64(message: Any) -> Optional[str]:
    """
    Download a message photo and return it base64-encoded, or None.

    Telethon file references are MTProto-only — the Bot API cannot resolve
    them — so the bytes travel to Next in the ingest payload and are stored to
    Vercel Blob there. Best-effort: an image is never worth losing a recipe.
    Must run while the Telethon connection is open.
    """
    if not getattr(message, "photo", None):
        return None

    try:
        data = await message.download_media(file=bytes)
        if not data:
            return None

        if len(data) > settings.MAX_PHOTO_BYTES:
            logger.warning(
                "photo_too_large",
                message_id=message.id,
                bytes=len(data),
                limit=settings.MAX_PHOTO_BYTES,
            )
            return None

        return base64.b64encode(data).decode("ascii")

    except Exception as error:  # noqa: BLE001 — best-effort by design
        logger.warning("photo_download_failed", message_id=message.id, error=str(error))
        return None


async def ingest_missing_message(
    next_client: NextInternalClient, message: Any, text: str
) -> MessageOutcome:
    """POST one message the DB is missing through the old-channel ingest route."""
    photo_base64 = await download_photo_base64(message)

    try:
        result = await next_client.old_channel_ingest(
            source_message_id=message.id,
            text=text,
            date=message_epoch_seconds(message),
            photo_base64=photo_base64,
        )
        return MessageOutcome(source_message_id=message.id, action=result.get("action", "unknown"))

    except Exception as error:  # noqa: BLE001 — one bad message must not stop the batch
        logger.error("old_channel_ingest_failed", message_id=message.id, error=str(error))
        return MessageOutcome(source_message_id=message.id, action="failed", error=str(error))


# ============================================================================
# Routes
# ============================================================================


@app.get("/")
async def root() -> Dict[str, Any]:
    """Service info."""
    return {
        "service": "Our Recipes — Telegram Reconcile",
        "version": "2.0.0",
        "status": "running",
        "environment": settings.ENVIRONMENT,
    }


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Connect to Telegram and ping the Next internal API."""
    telegram_status: Dict[str, Any] = {"connected": False}
    try:
        async with telegram_client() as client:
            me = await client.get_me()
            channel = await resolve_channel(client)
            telegram_status = {
                "connected": True,
                "user_id": getattr(me, "id", None),
                "username": getattr(me, "username", None),
                "channel": getattr(channel, "title", None),
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }
    except Exception as error:  # noqa: BLE001 — health must report, not raise
        telegram_status = {"connected": False, "error": str(error)}

    next_status: Dict[str, Any] = {"reachable": False}
    try:
        async with NextInternalClient() as next_client:
            await next_client.summary_old_channel([1])
            next_status = {"reachable": True, "base_url": settings.NEXT_BASE_URL}
    except Exception as error:  # noqa: BLE001
        next_status = {"reachable": False, "error": str(error)}

    healthy = telegram_status.get("connected") and next_status.get("reachable")

    return HealthResponse(
        status="healthy" if healthy else "degraded",
        environment=settings.ENVIRONMENT,
        telegram=telegram_status,
        next_api=next_status,
    )


@app.post("/reconcile", response_model=ReconcileResponse)
async def reconcile(
    data: ReconcileRequest,
    _: bool = Depends(require_internal_secret),
) -> ReconcileResponse:
    """
    Scan the last N old-channel messages and ingest whatever the DB is
    missing.

    No text-drift detection: the stored ``raw_content`` is always Gemini's
    reformat of the raw post, so it can never equal the channel text — "the
    row exists under this ``source_message_id``" is the only signal that
    matters. A message that already has a row is left alone; the webhook's
    ``edited_channel_post`` path is what carries channel edits into the DB.

    Each miss costs one Gemini call, so ``ingest_limit`` bounds how many of
    them this run actually makes; anything past the cap is picked up next
    time this endpoint is called. Raising both ``limit`` and ``ingest_limit``
    turns this same endpoint into the one-time full rebuild (see README).
    """
    ingest_limit = (
        data.ingest_limit if data.ingest_limit is not None else settings.RECONCILE_INGEST_LIMIT
    )
    logger.info("reconcile_started", limit=data.limit, ingest_limit=ingest_limit)

    async with telegram_client() as client:
        page = await fetch_page(client, limit=data.limit)

        async with NextInternalClient() as next_client:
            known = await next_client.summary_old_channel(
                message.id for message, _ in page.messages
            )

            missing = [pair for pair in page.messages if pair[0].id not in known]
            to_ingest = missing[:ingest_limit]
            deferred = len(missing) - len(to_ingest)

            outcomes: List[MessageOutcome] = []
            for message, text in to_ingest:
                outcomes.append(await ingest_missing_message(next_client, message, text))

    failed = sum(1 for outcome in outcomes if outcome.action == "failed")
    ingested = len(outcomes) - failed

    logger.info(
        "reconcile_finished",
        checked=len(page.messages),
        missing=len(missing),
        ingested=ingested,
        deferred=deferred,
        failed=failed,
    )

    return ReconcileResponse(
        ok=True,
        checked=len(page.messages),
        missing=len(missing),
        ingested=ingested,
        deferred=deferred,
        failed=failed,
        outcomes=outcomes,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development",
    )
