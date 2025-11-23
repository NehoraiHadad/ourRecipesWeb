"""
FastAPI main application for Telegram Service.
Handles all Telegram operations via REST API.
"""

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from config import settings, logger
from telegram_client import TelegramClientManager
from models import HealthCheck


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development"
    )
