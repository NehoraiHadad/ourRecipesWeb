"""
Background monitoring of old Telegram channel.
Copies new messages to new channel and notifies Next.js via webhook.
"""

from telethon import events
from telegram_client import TelegramClientManager
import httpx
from config import settings, logger
from utils.crypto import generate_webhook_signature
from datetime import datetime, timezone


async def start_monitoring():
    """
    Start background monitoring of old Telegram channel.

    When a new message arrives in the old channel:
    1. Copy it to the new channel
    2. Send a webhook to Next.js with the new message details

    This allows for gradual migration from old to new channel.
    """

    # Check if monitoring is enabled
    if not settings.OLD_CHANNEL_URL:
        logger.info(
            "background_monitoring_disabled",
            reason="OLD_CHANNEL_URL not configured"
        )
        return

    logger.info(
        "background_monitoring_initializing",
        old_channel=settings.OLD_CHANNEL_URL,
        new_channel=settings.NEW_CHANNEL_URL or settings.CHANNEL_URL
    )

    # Get Telegram client
    client = await TelegramClientManager.get_client()

    # Register event handler for new messages in old channel
    @client.on(events.NewMessage(chats=settings.OLD_CHANNEL_URL))
    async def handle_new_message(event):
        """
        Handle new message in old channel.
        Copy to new channel and notify Next.js.
        """
        try:
            logger.info(
                "new_message_detected",
                old_message_id=event.id,
                old_channel=settings.OLD_CHANNEL_URL,
                has_media=bool(event.media),
                has_text=bool(event.text)
            )

            # 1. Copy message to new channel
            target_channel = settings.NEW_CHANNEL_URL or settings.CHANNEL_URL
            new_message = await client.send_message(
                target_channel,
                event.text or "",
                file=event.media
            )

            logger.info(
                "message_copied",
                old_message_id=event.id,
                new_message_id=new_message.id,
                old_channel=settings.OLD_CHANNEL_URL,
                new_channel=target_channel
            )

            # 2. Prepare webhook payload
            payload = {
                "message_id": new_message.id,
                "content": event.text or "",
                "media_type": (
                    event.media.__class__.__name__
                    if event.media
                    else None
                ),
                "old_message_id": event.id,
                "timestamp": event.date.isoformat() if event.date else datetime.now(timezone.utc).isoformat(),
                "channel": target_channel
            }

            # 3. Send webhook to Next.js (if configured)
            if settings.NEXTJS_URL:
                await send_webhook(payload)
            else:
                logger.warning(
                    "webhook_skipped",
                    reason="NEXTJS_URL not configured",
                    message_id=new_message.id
                )

        except Exception as e:
            logger.error(
                "message_copy_failed",
                error=str(e),
                old_message_id=event.id,
                old_channel=settings.OLD_CHANNEL_URL
            )

    logger.info(
        "monitoring_started",
        old_channel=settings.OLD_CHANNEL_URL,
        new_channel=settings.NEW_CHANNEL_URL or settings.CHANNEL_URL,
        webhook_enabled=bool(settings.NEXTJS_URL)
    )

    # Keep the client running (monitoring in background)
    await client.run_until_disconnected()


async def send_webhook(payload: dict):
    """
    Send webhook to Next.js with HMAC signature.

    Args:
        payload: Message data to send
    """
    try:
        # Generate HMAC signature
        signature = generate_webhook_signature(payload)

        # Send POST request to Next.js
        async with httpx.AsyncClient() as http_client:
            logger.info(
                "sending_webhook",
                url=f"{settings.NEXTJS_URL}/api/webhooks/telegram-message",
                message_id=payload.get("message_id")
            )

            response = await http_client.post(
                f"{settings.NEXTJS_URL}/api/webhooks/telegram-message",
                json=payload,
                headers={
                    "X-Webhook-Signature": signature,
                    "Content-Type": "application/json"
                },
                timeout=10.0
            )

            if response.status_code == 200:
                logger.info(
                    "webhook_sent",
                    message_id=payload.get("message_id"),
                    status_code=response.status_code
                )
            else:
                logger.error(
                    "webhook_failed",
                    message_id=payload.get("message_id"),
                    status_code=response.status_code,
                    response_body=response.text
                )

    except httpx.TimeoutException:
        logger.error(
            "webhook_timeout",
            message_id=payload.get("message_id"),
            timeout=10.0
        )
    except Exception as e:
        logger.error(
            "webhook_error",
            error=str(e),
            message_id=payload.get("message_id")
        )
