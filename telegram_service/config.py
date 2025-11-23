"""
Configuration management for Telegram Service.
Uses pydantic-settings for environment variable validation.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
import structlog


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Telegram API credentials
    SESSION_STRING: str
    API_ID: int
    API_HASH: str
    CHANNEL_URL: str

    # Optional: Old channel for monitoring/migration
    OLD_CHANNEL_URL: Optional[str] = None
    NEW_CHANNEL_URL: Optional[str] = None

    # Security
    TELEGRAM_SERVICE_SECRET: str  # Bearer token for Next.js → Python
    WEBHOOK_SECRET: str  # HMAC secret for Python → Next.js

    # Next.js integration
    NEXTJS_URL: Optional[str] = None

    # Server configuration
    PORT: int = 8000
    ENVIRONMENT: str = "production"
    LOG_LEVEL: str = "info"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


def configure_logging(settings: Settings):
    """Configure structlog for JSON logging"""
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
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
