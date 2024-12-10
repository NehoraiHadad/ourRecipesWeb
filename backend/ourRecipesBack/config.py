import os
from datetime import timedelta


class Config:
    """Base configuration class"""

    # Flask core settings
    SECRET_KEY = os.getenv("SECRET_JWT", "dev-secret")

    # Database settings
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///recipes.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "connect_args": {"timeout": 15, "check_same_thread": False},
    }

    # Telegram settings
    SESSION_NAME = os.getenv("SESSION_NAME", "connect_to_our_recipes_channel")
    BOT_ID = os.getenv("BOT_ID")
    API_HASH = os.getenv("API_HASH")
    BOT_TOKEN = os.getenv("BOT_TOKEN")
    CHANNEL_URL = os.getenv("CHANNEL_URL")
    OLD_CHANNEL_URL = os.getenv("OLD_CHANNEL_URL")

    # Session settings
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "None"
    PERMANENT_SESSION_LIFETIME = timedelta(hours=1)

    # JWT settings
    JWT_SECRET_KEY = os.getenv("SECRET_JWT", "dev-secret")
    JWT_TOKEN_LOCATION = ["cookies"]
    JWT_COOKIE_SECURE = True
    JWT_COOKIE_CSRF_PROTECT = False
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=1)
    JWT_COOKIE_SAMESITE = "None"
    JWT_ERROR_MESSAGE_KEY = "message"
    JWT_ACCESS_COOKIE_NAME = "access_token_cookie"
    JWT_COOKIE_DOMAIN = None

    # CORS settings
    CORS_ORIGINS = os.getenv("ORIGIN_CORS", "http://127.0.0.1").split(",")

    # AI Service settings
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    HF_TOKEN = os.getenv("HF_TOKEN")


class DevelopmentConfig(Config):
    """Development configuration"""

    DEBUG = True
    JWT_COOKIE_SECURE = False
    SQLALCHEMY_DATABASE_URI = "sqlite:///dev.db"
    SESSION_COOKIE_SECURE = False


class TestingConfig(Config):
    """Testing configuration"""

    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    JWT_COOKIE_SECURE = False
    WTF_CSRF_ENABLED = False
    SESSION_COOKIE_SECURE = False


class ProductionConfig(Config):
    """Production configuration"""

    DEBUG = False
    TESTING = False
    # All security settings are inherited from Config


# Configuration dictionary
config = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    "default": ProductionConfig,
}
