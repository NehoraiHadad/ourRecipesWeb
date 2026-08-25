"""
FastAPI application for Telegram history reads (ARCHITECTURE §4.6).

Postgres is the source of truth and the Bot API webhook is the real-time input
path. This function covers the one thing the Bot API cannot do — **read channel
history**, including messages that predate the bot — and does so in two shapes:

  * ``POST /reconcile``      — daily safety net over the last N messages.
  * ``POST /import-history`` — one-time backfill, page by page.

It owns no database credentials: every write goes to the Next.js internal API,
which runs the same ingest code the webhook runs.

Run locally:      uvicorn main:app --reload --port 8000
Deploy (Vercel):  vercel deploy   (from this directory; api/index.py is the entry)
"""

import base64
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import Depends, FastAPI, HTTPException, Request

from config import logger, settings
from models import (
    HealthResponse,
    ImportHistoryRequest,
    ImportHistoryResponse,
    MessageOutcome,
    ReconcileRequest,
    ReconcileResponse,
)
from next_client import NextInternalClient, content_hash, safe_mirror_pending
from telegram_client import resolve_channel, telegram_client

app = FastAPI(
    title="Our Recipes — Telegram Reconcile",
    description="Telethon history reads: periodic reconcile and one-time history import",
    version="1.0.0",
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


def message_date(message: Any) -> Optional[str]:
    """ISO-8601 post time, for `created_at` on first insert."""
    date = getattr(message, "date", None)
    if not date:
        return None
    if date.tzinfo is None:
        date = date.replace(tzinfo=timezone.utc)
    return date.isoformat()


async def download_photo_base64(message: Any) -> Optional[str]:
    """
    Download a message photo and return it base64-encoded, or None.

    Telethon file references are MTProto-only — the Bot API cannot resolve
    them — so the bytes travel to Next in the upsert payload and are stored to
    Vercel Blob there. Best-effort: an image is never worth losing a recipe.
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


async def upsert_message(
    next_client: NextInternalClient,
    message: Any,
    text: str,
    with_photos: bool,
) -> MessageOutcome:
    """Push one channel message through the Next internal upsert endpoint."""
    photo_base64 = await download_photo_base64(message) if with_photos else None

    try:
        result = await next_client.upsert(
            telegram_id=message.id,
            text=text,
            date=message_date(message),
            photo_base64=photo_base64,
        )
        return MessageOutcome(telegram_id=message.id, action=result.get("action", "unknown"))

    except Exception as error:  # noqa: BLE001 — one bad message must not stop the batch
        logger.error("upsert_failed", message_id=message.id, error=str(error))
        return MessageOutcome(telegram_id=message.id, action="failed", error=str(error))


class ChannelPage:
    """One page of channel history, newest first."""

    def __init__(self, messages: List[Tuple[Any, str]], scanned: int, last_id: Optional[int]):
        #: (message, text) for messages that carry text — the only ones worth storing.
        self.messages = messages
        #: How many messages the iterator yielded, including skipped empty ones.
        self.scanned = scanned
        #: Oldest message id seen, i.e. the next ``offset_id`` to page from.
        self.last_id = last_id


async def fetch_page(client: Any, limit: int, offset_id: int = 0) -> ChannelPage:
    """
    Read one page of channel messages, newest first, skipping empty ones.

    Ported from ``telegram_service/main.py::sync_messages``. Must be called with
    a connected client — the returned message objects are only usable (for photo
    downloads) while that connection is alive.
    """
    channel = await resolve_channel(client)

    collected: List[Tuple[Any, str]] = []
    scanned = 0
    last_id: Optional[int] = None

    async for message in client.iter_messages(channel, limit=limit, offset_id=offset_id):
        scanned += 1
        last_id = message.id

        text = message_text(message)
        if not text:
            continue

        collected.append((message, text))

    return ChannelPage(collected, scanned, last_id)


# ============================================================================
# Routes
# ============================================================================


@app.get("/")
async def root() -> Dict[str, Any]:
    """Service info."""
    return {
        "service": "Our Recipes — Telegram Reconcile",
        "version": "1.0.0",
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
            await next_client.summary([1])
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
    Compare the last N channel messages against the DB and close the gaps.

    Only messages whose content hash differs from the stored one (or that are
    missing entirely) are upserted, so a healthy channel costs one summary
    request and nothing else. Finishes by asking Next to retry any recipe whose
    outgoing mirror failed.
    """
    logger.info("reconcile_started", limit=data.limit)

    outcomes: List[MessageOutcome] = []
    unchanged = 0

    # Everything runs inside the Telethon connection: photo bytes can only be
    # downloaded while it is open.
    async with telegram_client() as client:
        page = await fetch_page(client, limit=data.limit)

        async with NextInternalClient() as next_client:
            known = await next_client.summary([message.id for message, _ in page.messages])

            for message, text in page.messages:
                stored = known.get(message.id)
                if stored and stored.get("content_hash") == content_hash(text):
                    unchanged += 1
                    continue

                # Photos only for rows we are creating: an existing recipe
                # already has its image, and re-uploading on every text edit is
                # wasteful.
                with_photos = data.with_photos and stored is None
                outcomes.append(await upsert_message(next_client, message, text, with_photos))

            mirror = await safe_mirror_pending(next_client)

    failed = sum(1 for outcome in outcomes if outcome.action == "failed")

    logger.info(
        "reconcile_finished",
        checked=len(page.messages),
        upserted=len(outcomes) - failed,
        unchanged=unchanged,
        failed=failed,
    )

    return ReconcileResponse(
        ok=True,
        checked=len(page.messages),
        upserted=len(outcomes) - failed,
        unchanged=unchanged,
        failed=failed,
        outcomes=outcomes,
        mirror=mirror,
    )


@app.post("/import-history", response_model=ImportHistoryResponse)
async def import_history(
    data: ImportHistoryRequest,
    _: bool = Depends(require_internal_secret),
) -> ImportHistoryResponse:
    """
    Import one page of channel history, newest first.

    Designed to be called repeatedly: feed ``next_offset_id`` from each response
    back in as ``offset_id`` until ``has_more`` is false. Every upsert is
    idempotent, so re-running a page is harmless.
    """
    logger.info("import_history_started", offset_id=data.offset_id, limit=data.limit)

    outcomes: List[MessageOutcome] = []

    async with telegram_client() as client:
        page = await fetch_page(client, limit=data.limit, offset_id=data.offset_id)

        async with NextInternalClient() as next_client:
            for message, text in page.messages:
                outcomes.append(
                    await upsert_message(next_client, message, text, data.with_photos)
                )

    failed = sum(1 for outcome in outcomes if outcome.action == "failed")

    # Page from the oldest id *scanned*, not the oldest stored: text-less
    # messages must still advance the cursor or the import would loop forever.
    next_offset_id = page.last_id
    has_more = page.scanned >= data.limit and next_offset_id is not None

    logger.info(
        "import_history_finished",
        processed=len(page.messages),
        scanned=page.scanned,
        failed=failed,
        next_offset_id=next_offset_id,
        has_more=has_more,
    )

    return ImportHistoryResponse(
        ok=True,
        processed=len(page.messages),
        upserted=len(outcomes) - failed,
        failed=failed,
        next_offset_id=next_offset_id,
        has_more=has_more,
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
