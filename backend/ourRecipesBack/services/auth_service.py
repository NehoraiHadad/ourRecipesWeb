import hashlib
import hmac
from datetime import datetime, timezone, timedelta
from flask import current_app, jsonify
from flask_jwt_extended import create_access_token
from .telegram_service import telegram_service

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
        Check if user has edit permissions in channel
        
        Args:
            user_id (str): Telegram user ID
            channel_url (str, optional): Channel to check permissions for
            
        Returns:
            bool: Whether user has edit permissions
        """
        try:
            if not channel_url:
                channel_url = current_app.config["CHANNEL_URL"]

            client = await telegram_service.get_client()
            async with client:
                channel_entity = await client.get_entity(channel_url)
                permissions = await client.get_permissions(channel_entity, int(user_id))
                
                return permissions.is_admin and permissions.edit_messages

        except Exception as e:
            print(f"Permission check error: {str(e)}")
            return False

    @staticmethod
    def create_user_session(user_id):
        """Create session for authenticated user"""
        try:
            print(f"Creating access token for user {user_id}", flush=True)
            access_token = create_access_token(identity=str(user_id))
            print(f"Access token created successfully", flush=True)
            return access_token
        except Exception as e:
            print(f"Error creating access token: {str(e)}", flush=True)
            raise

    @classmethod
    def create_guest_session(cls):
        """Create session for guest user"""
        try:
            expires_delta = timedelta(hours=1)
            additional_claims = {
                "type": "guest",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            access_token = create_access_token(
                identity="guest",
                expires_delta=expires_delta,
                additional_claims=additional_claims
            )
            
            print("Created guest token", flush=True)
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