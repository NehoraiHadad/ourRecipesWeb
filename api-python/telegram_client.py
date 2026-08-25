"""
Telethon client management.

Unlike the old long-lived microservice (which held a singleton connection open
and polled), this function connects **per invocation**: a StringSession
handshake costs 1–3 seconds, which is fine for periodic batch work and is the
only shape that fits a serverless runtime (ARCHITECTURE §4.6).
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

from telethon import TelegramClient
from telethon.sessions import StringSession

from config import logger, settings


@asynccontextmanager
async def telegram_client() -> AsyncIterator[TelegramClient]:
    """
    Connect a Telethon client for the duration of one request, then disconnect.

    Usage:
        async with telegram_client() as client:
            ...

    Raises:
        RuntimeError: if SESSION_STRING is not an authorized session.
    """
    client = TelegramClient(
        session=StringSession(settings.SESSION_STRING),
        api_id=settings.TELEGRAM_API_ID,
        api_hash=settings.TELEGRAM_API_HASH,
    )

    logger.info("telegram_client_connecting", api_id=settings.TELEGRAM_API_ID)
    await client.connect()

    try:
        if not await client.is_user_authorized():
            raise RuntimeError(
                "SESSION_STRING is not authorized — regenerate it with Telethon"
            )

        me = await client.get_me()
        logger.info(
            "telegram_client_connected",
            user_id=getattr(me, "id", None),
            username=getattr(me, "username", None),
        )

        yield client

    finally:
        await client.disconnect()
        logger.info("telegram_client_disconnected")


async def resolve_channel(client: TelegramClient, channel_id: Optional[int] = None):
    """
    Resolve the main channel entity.

    A fresh StringSession has an empty entity cache, so ``get_entity`` on a bare
    ``-100…`` id can fail with "Could not find the input entity". Three attempts,
    cheapest first:

      1. ``TELEGRAM_CHANNEL_URL`` (@username or t.me link), when configured;
      2. the numeric marked id;
      3. a walk over the account's dialogs, which populates the cache as a side
         effect.

    Raises:
        RuntimeError: if the channel cannot be resolved by any route.
    """
    target_id = channel_id if channel_id is not None else settings.TELEGRAM_CHANNEL_ID

    if settings.TELEGRAM_CHANNEL_URL:
        try:
            entity = await client.get_entity(settings.TELEGRAM_CHANNEL_URL)
            logger.info("channel_resolved", via="url", channel=settings.TELEGRAM_CHANNEL_URL)
            return entity
        except Exception as error:  # noqa: BLE001 — fall through to the next strategy
            logger.warning("channel_resolve_by_url_failed", error=str(error))

    try:
        entity = await client.get_entity(target_id)
        logger.info("channel_resolved", via="id", channel_id=target_id)
        return entity
    except Exception as error:  # noqa: BLE001 — fall through to the dialog walk
        logger.warning("channel_resolve_by_id_failed", error=str(error), channel_id=target_id)

    async for dialog in client.iter_dialogs():
        if dialog.id == target_id:
            logger.info("channel_resolved", via="dialogs", channel_id=target_id)
            return dialog.entity

    raise RuntimeError(
        f"Could not resolve channel {target_id}. "
        "Set TELEGRAM_CHANNEL_URL, or make sure the session account is a member."
    )
