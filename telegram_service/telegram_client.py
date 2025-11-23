"""
Telegram client management using Telethon.
Implements singleton pattern to maintain a single connection.
"""

from telethon import TelegramClient
from telethon.sessions import StringSession
from config import settings, logger
import asyncio
from contextlib import asynccontextmanager
from typing import Optional
from datetime import datetime, timezone


class TelegramClientManager:
    """
    Singleton manager for Telegram client.
    Ensures only one connection is maintained throughout the service lifecycle.
    """

    _client: Optional[TelegramClient] = None
    _lock = asyncio.Lock()

    @classmethod
    async def get_client(cls) -> TelegramClient:
        """
        Get or create Telegram client singleton.
        Thread-safe using asyncio Lock.
        """
        async with cls._lock:
            if cls._client is None:
                logger.info(
                    "telegram_client_initializing",
                    api_id=settings.API_ID,
                    environment=settings.ENVIRONMENT
                )

                cls._client = TelegramClient(
                    session=StringSession(settings.SESSION_STRING),
                    api_id=settings.API_ID,
                    api_hash=settings.API_HASH
                )

                await cls._client.start()

                # Verify connection
                me = await cls._client.get_me()
                logger.info(
                    "telegram_client_connected",
                    user_id=me.id,
                    username=me.username,
                    phone=me.phone
                )

            return cls._client

    @classmethod
    async def close(cls):
        """Close the Telegram client on shutdown"""
        if cls._client:
            logger.info("telegram_client_disconnecting")
            await cls._client.disconnect()
            cls._client = None
            logger.info("telegram_client_disconnected")

    @classmethod
    async def check_health(cls) -> dict:
        """
        Check Telegram client health status.
        Used by /health endpoint.
        """
        try:
            client = await cls.get_client()

            if not client.is_connected():
                return {
                    "status": "unhealthy",
                    "message": "Client not connected",
                    "connected": False
                }

            me = await client.get_me()

            return {
                "status": "healthy",
                "connected": True,
                "user_id": me.id,
                "username": me.username,
                "phone": me.phone,
                "last_check": datetime.now(timezone.utc).isoformat()
            }

        except Exception as e:
            logger.error("health_check_failed", error=str(e))
            return {
                "status": "error",
                "connected": False,
                "error": str(e),
                "last_check": datetime.now(timezone.utc).isoformat()
            }


@asynccontextmanager
async def get_telegram_client():
    """
    Context manager for Telegram operations.

    Usage:
        async with get_telegram_client() as client:
            await client.send_message(...)

    Note: Does NOT close the client after use (singleton pattern).
    """
    client = await TelegramClientManager.get_client()
    try:
        yield client
    except Exception as e:
        logger.error("telegram_operation_failed", error=str(e))
        raise
