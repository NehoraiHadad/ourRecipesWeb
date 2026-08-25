"""
Configuration management for the reconcile / history-import function.

Uses pydantic-settings for environment variable validation, matching the style
of the (now superseded) telegram_service.
"""

from typing import Optional

import structlog
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Telegram MTProto credentials (Telethon). The Bot API cannot read channel
    # history, which is the only reason this Python function exists.
    TELEGRAM_API_ID: int
    TELEGRAM_API_HASH: str
    SESSION_STRING: str

    # Main channel. The numeric -100… id is the canonical identifier; the URL /
    # @username is an optional fallback, because resolving a bare channel id on
    # a freshly restored StringSession can fail until the entity is cached.
    TELEGRAM_CHANNEL_ID: int
    TELEGRAM_CHANNEL_URL: Optional[str] = None

    # Next.js internal API — the only way this service touches data.
    NEXT_BASE_URL: str
    INTERNAL_API_SECRET: str

    # Behaviour
    RECONCILE_LIMIT: int = 50
    IMPORT_LIMIT: int = 100
    MAX_PHOTO_BYTES: int = 5 * 1024 * 1024
    HTTP_TIMEOUT_SECONDS: float = 30.0

    # Runtime
    PORT: int = 8000
    ENVIRONMENT: str = "production"
    LOG_LEVEL: str = "info"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


def configure_logging(settings: Settings) -> None:
    """Configure structlog for JSON logging"""
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


# Create global settings instance
settings = Settings()

# Configure logging
configure_logging(settings)

# Get logger
logger = structlog.get_logger()
