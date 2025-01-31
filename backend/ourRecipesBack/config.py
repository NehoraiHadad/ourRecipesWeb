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
    SESSION_COOKIE_SAMESITE = "None"  # Required for cross-origin
    SESSION_COOKIE_NAME = "session_our_recipes"  # Custom name to avoid conflicts
    PERMANENT_SESSION_LIFETIME = timedelta(hours=1)

    # JWT settings
    JWT_SECRET_KEY = os.getenv("SECRET_JWT", "dev-secret")
    JWT_TOKEN_LOCATION = ["headers", "cookies"]
    JWT_HEADER_NAME = "Authorization"
    JWT_HEADER_TYPE = "Bearer"
    JWT_COOKIE_SECURE = True
    JWT_COOKIE_CSRF_PROTECT = False
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)
    JWT_COOKIE_SAMESITE = "None"  # Required for cross-origin
    JWT_ERROR_MESSAGE_KEY = "message"
    JWT_ACCESS_COOKIE_NAME = "our_recipes_access_token"  # Custom name to avoid conflicts
    JWT_COOKIE_DOMAIN = None
    JWT_COOKIE_HTTPONLY = True
    JWT_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days in seconds
    JWT_COOKIE_PATH = "/"  # Ensure cookie is available across all paths

    # CORS settings
    CORS_ORIGINS = os.getenv("ORIGIN_CORS", "http://127.0.0.1,http://localhost").split(",")
    CORS_SUPPORTS_CREDENTIALS = True  # Required for cookies
    CORS_ALLOW_HEADERS = [
        "Content-Type",
        "Authorization",
        "X-CSRF-TOKEN",
        "Accept",
        "Origin",
        "X-Requested-With",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
        "Authorization"
    ]
    CORS_EXPOSE_HEADERS = [
        "Content-Type",
        "Authorization",
        "Set-Cookie",
        "Access-Control-Allow-Origin",
        "Access-Control-Allow-Credentials",
        "Authorization"
    ]
    CORS_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]
    CORS_MAX_AGE = 600  # Cache preflight requests for 10 minutes

    # AI Service settings
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    HF_TOKEN = os.getenv("HF_TOKEN")

    # google drive settings
    GOOGLE_DRIVE_TOKEN = os.getenv("GOOGLE_DRIVE_TOKEN")
    GOOGLE_DRIVE_REFRESH_TOKEN = os.getenv("GOOGLE_DRIVE_REFRESH_TOKEN")
    GOOGLE_DRIVE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_DRIVE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
    SESSION_FILE_1_ID = os.getenv("SESSION_FILE_1_ID")
    SESSION_FILE_2_ID = os.getenv("SESSION_FILE_2_ID")

class DevelopmentConfig(Config):
    """Development configuration"""

    DEBUG = True
    JWT_COOKIE_SECURE = False
    SESSION_COOKIE_SECURE = False
    SQLALCHEMY_DATABASE_URI = "sqlite:///dev.db"
    
    # Development-specific session names
    SESSION_NAME = "connect_to_our_recipes_channel_dev"
    
    # Disable Google Drive session file download in development
    GOOGLE_DRIVE_TOKEN = None
    GOOGLE_DRIVE_REFRESH_TOKEN = None
    GOOGLE_DRIVE_CLIENT_ID = None
    GOOGLE_DRIVE_CLIENT_SECRET = None
    SESSION_FILE_1_ID = None
    SESSION_FILE_2_ID = None
    
    # More permissive CORS for development
    CORS_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:5000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5000",
        "http://127.0.0.1",
        "http://localhost"
    ]
    JWT_COOKIE_SAMESITE = "Lax"  # More permissive for local development
    SESSION_COOKIE_SAMESITE = "Lax"
    JWT_COOKIE_DOMAIN = None
    JWT_COOKIE_SECURE = False  # Allow HTTP in development


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
