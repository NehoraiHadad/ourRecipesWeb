"""
FastAPI main application for Telegram Service.
Handles all Telegram operations via REST API.
"""

from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from io import BytesIO
import base64

from config import settings, logger
from telegram_client import TelegramClientManager, get_telegram_client
from models import (
    HealthCheck,
    MessageData,
    MessageEdit,
    MessageResponse,
    MessageEditResponse,
    MessageDeleteResponse,
    SyncRequest,
    SyncResponse,
    TelegramMessage
)
from utils.crypto import verify_request_signature


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan manager.
    Handles startup and shutdown of the Telegram client.
    """
    logger.info(
        "service_starting",
        environment=settings.ENVIRONMENT,
        port=settings.PORT
    )

    # Startup: Initialize Telegram client
    try:
        client = await TelegramClientManager.get_client()
        logger.info("telegram_client_startup_complete")
    except Exception as e:
        logger.error("telegram_client_startup_failed", error=str(e))
        raise

    yield

    # Shutdown: Close Telegram client
    await TelegramClientManager.close()
    logger.info("service_shutdown_complete")


# Initialize FastAPI app
app = FastAPI(
    title="Telegram Service",
    description="Python microservice for Telegram operations using Telethon",
    version="1.0.0",
    lifespan=lifespan
)


@app.get("/")
async def root():
    """Root endpoint - service info"""
    return {
        "service": "Telegram Service",
        "version": "1.0.0",
        "status": "running",
        "environment": settings.ENVIRONMENT
    }


@app.get("/health", response_model=HealthCheck)
async def health_check():
    """
    Comprehensive health check endpoint.
    Checks Telegram connection and configuration.
    """
    health = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "environment": settings.ENVIRONMENT,
        "checks": {}
    }

    # Check Telegram connection
    telegram_health = await TelegramClientManager.check_health()
    health["checks"]["telegram"] = telegram_health

    if telegram_health["status"] != "healthy":
        health["status"] = "degraded"

    # Check environment variables
    required_vars = [
        "SESSION_STRING",
        "API_ID",
        "API_HASH",
        "CHANNEL_URL",
        "TELEGRAM_SERVICE_SECRET",
        "WEBHOOK_SECRET"
    ]

    missing = []
    for var in required_vars:
        if not getattr(settings, var, None):
            missing.append(var)

    if missing:
        health["status"] = "unhealthy"
        health["checks"]["config"] = {
            "status": "error",
            "missing_vars": missing
        }
    else:
        health["checks"]["config"] = {"status": "ok"}

    # Return appropriate status code
    status_code = 200 if health["status"] in ["healthy", "degraded"] else 503

    return JSONResponse(content=health, status_code=status_code)


@app.get("/telegram/session/status")
async def session_status():
    """
    Check Telegram session health.
    Returns connection status and user information.
    """
    try:
        health = await TelegramClientManager.check_health()
        return health

    except Exception as e:
        logger.error("session_status_check_failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check session status: {str(e)}"
        )


# ============================================================================
# Telegram Operations Endpoints
# ============================================================================


@app.post("/telegram/send-message", response_model=MessageResponse)
async def send_message(
    data: MessageData,
    verified: bool = Depends(verify_request_signature)
):
    """
    Send a message to Telegram channel.

    Requires Bearer token authentication.
    Supports text messages with optional images (base64 encoded).
    """
    try:
        logger.info(
            "send_message_request",
            has_image=bool(data.image_data),
            channel_override=bool(data.channel_url)
        )

        async with get_telegram_client() as client:
            # Get channel entity
            channel_url = data.channel_url or settings.CHANNEL_URL
            channel = await client.get_entity(channel_url)

            # Prepare image file if provided
            file = None
            if data.image_data:
                try:
                    # Decode base64 image
                    image_bytes = base64.b64decode(data.image_data)
                    file = BytesIO(image_bytes)
                    file.name = "image.jpg"
                    logger.info("image_prepared", size_bytes=len(image_bytes))
                except Exception as img_error:
                    logger.error("image_decode_failed", error=str(img_error))
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid image data: {str(img_error)}"
                    )

            # Send message to Telegram
            message = await client.send_message(
                channel,
                data.content,
                file=file
            )

            logger.info(
                "message_sent",
                message_id=message.id,
                channel=channel_url
            )

            return MessageResponse(
                message_id=message.id,
                date=message.date.isoformat(),
                success=True
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("send_message_failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send message: {str(e)}"
        )


@app.put("/telegram/edit-message", response_model=MessageEditResponse)
async def edit_message(
    data: MessageEdit,
    verified: bool = Depends(verify_request_signature)
):
    """
    Edit an existing message in Telegram channel.

    Requires Bearer token authentication.
    Can update text and/or image.
    """
    try:
        logger.info(
            "edit_message_request",
            message_id=data.message_id,
            has_image=bool(data.image_data)
        )

        async with get_telegram_client() as client:
            # Get channel entity
            channel_url = data.channel_url or settings.CHANNEL_URL
            channel = await client.get_entity(channel_url)

            # Verify message exists
            message = await client.get_messages(channel, ids=data.message_id)
            if not message:
                raise HTTPException(
                    status_code=404,
                    detail=f"Message {data.message_id} not found in channel"
                )

            # Prepare image file if provided
            file = None
            if data.image_data:
                try:
                    image_bytes = base64.b64decode(data.image_data)
                    file = BytesIO(image_bytes)
                    file.name = "image.jpg"
                    logger.info("image_prepared", size_bytes=len(image_bytes))
                except Exception as img_error:
                    logger.error("image_decode_failed", error=str(img_error))
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid image data: {str(img_error)}"
                    )

            # Edit message
            await client.edit_message(
                channel,
                data.message_id,
                data.content,
                file=file
            )

            logger.info(
                "message_edited",
                message_id=data.message_id,
                channel=channel_url
            )

            return MessageEditResponse(
                success=True,
                updated_at=datetime.now(timezone.utc).isoformat()
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "edit_message_failed",
            error=str(e),
            message_id=data.message_id
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to edit message: {str(e)}"
        )


@app.delete("/telegram/delete-message/{message_id}", response_model=MessageDeleteResponse)
async def delete_message(
    message_id: int,
    channel_url: str = Query(None, description="Override default channel URL"),
    verified: bool = Depends(verify_request_signature)
):
    """
    Delete a message from Telegram channel.

    Requires Bearer token authentication.
    """
    try:
        logger.info("delete_message_request", message_id=message_id)

        async with get_telegram_client() as client:
            # Get channel entity
            target_channel = channel_url or settings.CHANNEL_URL
            channel = await client.get_entity(target_channel)

            # Delete message
            await client.delete_messages(channel, [message_id])

            logger.info(
                "message_deleted",
                message_id=message_id,
                channel=target_channel
            )

            return MessageDeleteResponse(
                success=True,
                deleted_at=datetime.now(timezone.utc).isoformat()
            )

    except Exception as e:
        logger.error(
            "delete_message_failed",
            error=str(e),
            message_id=message_id
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete message: {str(e)}"
        )


@app.post("/telegram/sync-messages", response_model=SyncResponse)
async def sync_messages(
    data: SyncRequest,
    verified: bool = Depends(verify_request_signature)
):
    """
    Fetch messages from Telegram channel.

    Used for initial DB population and incremental sync.
    Supports pagination via offset_id.
    """
    try:
        logger.info(
            "sync_messages_request",
            limit=data.limit,
            offset_id=data.offset_id,
            reverse=data.reverse
        )

        async with get_telegram_client() as client:
            # Get channel entity
            channel_url = data.channel_url or settings.CHANNEL_URL
            channel = await client.get_entity(channel_url)

            # Fetch messages
            messages = []
            async for message in client.iter_messages(
                channel,
                limit=data.limit,
                offset_id=data.offset_id,
                reverse=data.reverse
            ):
                # Skip empty messages
                if not message.text:
                    continue

                messages.append(
                    TelegramMessage(
                        id=message.id,
                        text=message.text,
                        date=message.date.isoformat(),
                        media_type=(
                            message.media.__class__.__name__
                            if message.media
                            else None
                        ),
                        has_image=bool(message.photo or message.document)
                    )
                )

            logger.info(
                "messages_synced",
                count=len(messages),
                channel=channel_url
            )

            return SyncResponse(
                messages=messages,
                count=len(messages),
                has_more=(len(messages) == data.limit)
            )

    except Exception as e:
        logger.error("sync_messages_failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to sync messages: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development"
    )
