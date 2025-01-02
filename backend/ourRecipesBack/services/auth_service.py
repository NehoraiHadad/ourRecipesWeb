import hashlib
import hmac
from datetime import datetime, timezone, timedelta
from flask import current_app, jsonify
from flask_jwt_extended import create_access_token
from .telegram_service import telegram_service
from flask_caching import Cache
import logging

# Cache configuration
cache = Cache(config={
    'CACHE_TYPE': 'simple',
    'CACHE_DEFAULT_TIMEOUT': 3600  # One hour
})

# Logger configuration
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Set log format
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# Add console handler
console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

def init_cache(app):
    """Initialize cache with the Flask application"""
    global cache
    cache.init_app(app)

class AuthService:
    """Service for handling authentication and authorization"""

    @staticmethod
    def verify_telegram_login(auth_data):
        """Verify Telegram login data authenticity"""
        try:
            check_hash = auth_data.pop("hash", None)
            if not check_hash:
                return False

            # Create data check string
            data_check_string = "\n".join(
                f"{key}={value}" for key, value in sorted(auth_data.items())
            )

            # Create secret key from bot token
            secret_key = hashlib.sha256(
                current_app.config["BOT_TOKEN"].encode()
            ).digest()

            # Calculate HMAC hash
            hmac_hash = hmac.new(
                secret_key,
                data_check_string.encode(),
                hashlib.sha256
            ).hexdigest()

            return hmac_hash == check_hash

        except Exception as e:
            print(f"Telegram verification error: {str(e)}", flush=True)
            return False

    @classmethod
    async def check_edit_permission(cls, user_id, channel_url=None):
        """
        Check edit permissions with enhanced caching system
        
        Args:
            user_id (str): Telegram user ID
            channel_url (str, optional): Channel URL to check permissions for
            
        Returns:
            bool: Whether the user has edit permissions
        """
        try:
            # Guest users never have permissions - check this before cache
            if isinstance(user_id, str) and user_id.startswith('guest_'):
                logger.info(
                    "Guest user permission check - "
                    f"User: {user_id}, "
                    f"Result: False, "
                    f"Time: {datetime.now(timezone.utc).isoformat()}"
                )
                return False

            if not channel_url:
                channel_url = current_app.config["CHANNEL_URL"]
                
            cache_key = f"permissions_{user_id}_{channel_url}"
            current_time = datetime.now(timezone.utc).isoformat()
            
            # Check if exists in Cache
            cached_result = cache.get(cache_key)
            if cached_result is not None:
                logger.info(
                    "Cache hit for permissions check - "
                    f"User: {user_id}, "
                    f"Channel: {channel_url}, "
                    f"Result: {cached_result}, "
                    f"Time: {current_time}"
                )
                return cached_result

            # If not in Cache, check with Telegram
            logger.info(
                "Cache miss - checking Telegram permissions - "
                f"User: {user_id}, "
                f"Channel: {channel_url}, "
                f"Time: {current_time}"
            )

            result = await telegram_service.check_permissions(user_id, channel_url)

            # Only cache successful permission checks or explicit membership checks
            # Don't cache errors or temporary failures
            if result is not None:
                cache.set(cache_key, result, timeout=3600)  # Expires in 1 hour
                logger.info(
                    "New permissions cached - "
                    f"User: {user_id}, "
                    f"Channel: {channel_url}, "
                    f"Result: {result}, "
                    f"Time: {current_time}, "
                    f"Expires: {datetime.fromtimestamp(datetime.now().timestamp() + 3600, timezone.utc).isoformat()}"
                )

            return result

        except Exception as e:
            error_msg = str(e)
            if "not a member" in error_msg.lower():
                logger.warning(
                    "User not in channel - "
                    f"User: {user_id}, "
                    f"Channel: {channel_url}, "
                    f"Time: {datetime.now(timezone.utc).isoformat()}"
                )
            else:
                logger.error(
                    "Permission check error - "
                    f"User: {user_id}, "
                    f"Channel: {channel_url}, "
                    f"Error: {error_msg}, "
                    f"Time: {datetime.now(timezone.utc).isoformat()}"
                )
            return False

    @staticmethod
    def create_user_session(user_id, auth_type="telegram", permissions=None):
        """Create session for authenticated user"""
        try:
            expires_delta = timedelta(days=7) 
            additional_claims = {
                "type": auth_type,
                "permissions": permissions or {},
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            access_token = create_access_token(
                identity=str(user_id),
                expires_delta=expires_delta,
                additional_claims=additional_claims
            )
            
            return access_token
        except Exception as e:
            print(f"Error creating access token: {str(e)}", flush=True)
            raise

    @classmethod
    def create_guest_session(cls, guest_id):
        """Create session for guest user"""
        try:
            expires_delta = timedelta(hours=24) 
            additional_claims = {
                "type": "guest",
                "permissions": {"can_edit": False},
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            access_token = create_access_token(
                identity=guest_id,
                expires_delta=expires_delta,
                additional_claims=additional_claims
            )
            
            return access_token
        except Exception as e:
            print(f"Guest session error: {str(e)}", flush=True)
            raise 

    @staticmethod
    def setup_jwt_handlers(jwt):
        """Setup JWT handlers"""
        
        @jwt.token_in_blocklist_loader
        def check_if_token_revoked(jwt_header, jwt_payload):
            return False  # Implement token blocklist if needed

        @jwt.expired_token_loader
        def expired_token_callback(jwt_header, jwt_payload):
            print(f"Token expired: {jwt_payload}", flush=True)
            return jsonify({
                "authenticated": False,
                "message": "Token has expired",
                "debug": {
                    "header": jwt_header,
                    "payload": jwt_payload
                }
            }), 401

        @jwt.invalid_token_loader
        def invalid_token_callback(error_string):
            print(f"Invalid token: {error_string}", flush=True)
            return jsonify({
                "authenticated": False,
                "message": f"Invalid token: {error_string}",
                "debug": {
                    "error": error_string
                }
            }), 401

        @jwt.unauthorized_loader
        def missing_token_callback(error_string):
            print(f"Missing token: {error_string}", flush=True)
            return jsonify({
                "authenticated": False,
                "message": "No authentication token found",
                "debug": {
                    "error": error_string
                }
            }), 401
            
        @jwt.token_verification_loader
        def verify_token_callback(jwt_header, jwt_payload):
            return True
            
        @jwt.token_verification_failed_loader
        def token_verification_failed_callback(jwt_header, jwt_payload, error_string):
            print(f"Token verification failed: {error_string}", flush=True)
            return jsonify({
                "authenticated": False,
                "message": "Token verification failed",
                "debug": {
                    "header": jwt_header,
                    "payload": jwt_payload,
                    "error": error_string
                }
            }), 401

        @jwt.needs_fresh_token_loader
        def token_not_fresh_callback(jwt_header, jwt_payload):
            print(f"Token not fresh: {jwt_payload}", flush=True)
            return jsonify({
                "authenticated": False,
                "message": "Fresh token required",
                "debug": {
                    "header": jwt_header,
                    "payload": jwt_payload
                }
            }), 401

    @staticmethod
    def clear_permissions_cache(user_id=None):
        """
        Clear permissions cache
        
        Args:
            user_id (str, optional): If specified, clear only for specific user
        """
        try:
            if user_id:
                pattern = f"permissions_{user_id}_*"
                keys_to_delete = cache.delete_pattern(pattern)
                logger.info(f"Cleared permissions cache for user {user_id} - Deleted {len(keys_to_delete)} keys")
            else:
                cache.delete_pattern("permissions_*")
                logger.info("Cleared all permissions cache")
        except Exception as e:
            logger.error(f"Error clearing permissions cache: {str(e)}")