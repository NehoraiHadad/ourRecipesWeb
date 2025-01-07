from flask import current_app, jsonify, request, session
from flask_jwt_extended import jwt_required, get_jwt_identity, set_access_cookies
from ..services.auth_service import AuthService
from flask import Blueprint
from datetime import datetime, timezone
import uuid
import logging

# Configure logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(handler)

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['POST'])
async def login():
    """Handle Telegram login"""
    try:
        # Log request details
        logger.info("=== Login Request ===")
        logger.info(f"Headers: {dict(request.headers)}")
        logger.info(f"Origin: {request.headers.get('Origin')}")
        
        user_data = request.json
        logger.info(f"Login attempt with data: {user_data}")
        
        if not user_data or not user_data.get("id"):
            return jsonify({"error": "נתוני משתמש לא תקינים"}), 400

        user_id = str(user_data["id"])

        # Verify Telegram authentication
        if not AuthService.verify_telegram_login(user_data):
            return jsonify({"error": "אימות נכשל"}), 401

        # Get origin and determine environment
        origin = request.headers.get('Origin')
        if not origin and current_app.debug:
            origin = request.headers.get('Host', 'http://localhost:3000')
            if not origin.startswith('http'):
                origin = f"http://{origin}"
            logger.info(f"Debug mode: Setting default origin to {origin}")

        # Determine cookie settings based on environment
        is_development = current_app.debug
        cookie_settings = {
            'secure': not is_development,
            'httponly': True,
            'samesite': 'Lax' if is_development else 'None',
            'path': '/',
            'domain': None  # Let the browser set the domain
        }

        # בדיקת הרשאות בטלגרם
        has_permission = await AuthService.check_edit_permission(user_id)
        
        # יצירת סשן עם מידע מורחב
        session["user_id"] = user_id
        session["auth_type"] = "telegram"
        session["login_time"] = datetime.now(timezone.utc).isoformat()
        session["edit_permission"] = has_permission
        session["user_name"] = user_data.get("first_name", "") or user_data.get("username", "") or user_id
        
        # יצירת טוקן עם מידע נוסף
        access_token = AuthService.create_user_session(
            user_id, 
            auth_type="telegram",
            permissions={"can_edit": has_permission}
        )

        response = jsonify({
            "login": True,
            "canEdit": has_permission,
            "user": {
                "id": user_id,
                "name": user_data.get("first_name", ""),
                "type": "telegram"
            },
            "message": "אין לך הרשאות עריכה. יש להצטרף לערוץ הטלגרם כדי לקבל הרשאות." if not has_permission else None
        })

        # Set CORS headers
        if origin:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Expose-Headers'] = 'Set-Cookie'

        # Set cookies with improved settings
        set_access_cookies(response, access_token)
        
        # Log response details
        logger.info("=== Login Response ===")
        logger.info(f"Response headers: {dict(response.headers)}")
        logger.info(f"Cookie settings: {cookie_settings}")
        logger.info(f"Effective origin: {origin}")
        
        return response

    except Exception as e:
        logger.error(f"Login error: {str(e)}", exc_info=True)
        return jsonify({"error": "התחברות נכשלה", "details": str(e)}), 500

@auth_bp.route('/guest', methods=['POST'])
def login_guest():
    """Handle guest login"""
    try:
        # Log request details
        logger.info("=== Guest Login Request ===")
        logger.info(f"Headers: {dict(request.headers)}")
        logger.info(f"Origin: {request.headers.get('Origin')}")

        # Get origin and determine environment
        origin = request.headers.get('Origin')
        if not origin and current_app.debug:
            origin = request.headers.get('Host', 'http://localhost:3000')
            if not origin.startswith('http'):
                origin = f"http://{origin}"
            logger.info(f"Debug mode: Setting default origin to {origin}")

        # Generate guest ID
        guest_id = f"guest_{uuid.uuid4().hex[:8]}"
        logger.info(f"Generated guest ID: {guest_id}")
        
        # Create session data
        session["user_id"] = guest_id
        session["auth_type"] = "guest"
        session["login_time"] = datetime.now(timezone.utc).isoformat()
        session["edit_permission"] = False
        session["user_name"] = f"אורח_{guest_id[-4:]}"  # Last 4 chars of guest ID
        
        # Create access token
        access_token = AuthService.create_guest_session(guest_id)

        # Determine cookie settings based on environment
        is_development = current_app.debug
        cookie_settings = {
            'secure': not is_development,
            'httponly': True,
            'samesite': 'Lax' if is_development else 'None',
            'path': '/',
            'domain': None  # Let the browser set the domain
        }

        response = jsonify({
            "login": True,
            "canEdit": False,
            "user": {
                "id": guest_id,
                "name": session["user_name"],
                "type": "guest"
            },
            "message": "ברוכים הבאים! שימו לב שכמשתמש אורח אין אפשרות לערוך מתכונים."
        })

        # Set CORS headers
        if origin:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Expose-Headers'] = 'Set-Cookie'

        # Set cookies with improved settings
        set_access_cookies(response, access_token)
        
        # Log response details
        logger.info("=== Guest Login Response ===")
        logger.info(f"Response headers: {dict(response.headers)}")
        logger.info(f"Cookie settings: {cookie_settings}")
        logger.info(f"Effective origin: {origin}")
        
        return response

    except Exception as e:
        logger.error(f"Guest login error: {str(e)}", exc_info=True)
        return jsonify({
            "error": "התחברות כאורח נכשלה",
            "details": str(e) if current_app.debug else None
        }), 500

@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Handle user logout"""
    try:
        # Log request details
        logger.info("=== Logout Request ===")
        logger.info(f"Headers: {dict(request.headers)}")
        logger.info(f"Cookies to clear: {dict(request.cookies)}")

        # Get origin and determine environment
        origin = request.headers.get('Origin')
        if not origin and current_app.debug:
            origin = request.headers.get('Host', 'http://localhost:3000')
            if not origin.startswith('http'):
                origin = f"http://{origin}"
            logger.info(f"Debug mode: Setting default origin to {origin}")

        # Clear session
        session.clear()

        # Prepare response
        response = jsonify({"logout": True})

        # Set CORS headers
        if origin:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Expose-Headers'] = 'Set-Cookie'

        # Clear all cookies with appropriate settings
        is_development = current_app.debug
        cookie_settings = {
            'secure': not is_development,
            'httponly': True,
            'samesite': 'Lax' if is_development else 'None',
            'path': '/',
            'domain': None,
            'expires': 0,  # Expire immediately
            'max_age': 0   # Expire immediately
        }

        # Clear specific cookies
        for cookie_name in ['session_our_recipes', 'our_recipes_access_token', 'test_cookie']:
            response.set_cookie(cookie_name, '', **cookie_settings)

        # Log response details
        logger.info("=== Logout Response ===")
        logger.info(f"Response headers: {dict(response.headers)}")
        logger.info(f"Cookie settings for clearing: {cookie_settings}")
        
        return response

    except Exception as e:
        logger.error(f"Logout error: {str(e)}", exc_info=True)
        return jsonify({
            "error": "התנתקות נכשלה",
            "details": str(e) if current_app.debug else None
        }), 500

@auth_bp.route('/validate', methods=['GET'])
@jwt_required()
async def validate_session():
    """Validate current session"""
    try:
        current_user = get_jwt_identity()
        user_id = session.get("user_id")
        
        print(f"current_user: {current_user}", flush=True)
        print(f"session userId: {user_id}", flush=True)

        if not user_id:
            return jsonify({"authenticated": False}), 401

        # Guest users are always authenticated but never have edit permissions
        if isinstance(user_id, str) and user_id.startswith('guest_'):
            session["edit_permission"] = False
            return jsonify({
                "authenticated": True,
                "canEdit": False,
                "user_id": user_id,
                "message": "משתמשי אורח לא יכולים לערוך מתכונים"
            }), 200

        if user_id == current_user:
            permission = await AuthService.check_edit_permission(
                user_id, 
                current_app.config["OLD_CHANNEL_URL"]
            )
            session["edit_permission"] = permission
            
            return jsonify({
                "authenticated": True,
                "canEdit": permission,
                "user_id": user_id,
                "message": "אין לך הרשאות עריכה. יש להצטרף לערוץ הטלגרם כדי לקבל הרשאות." if not permission else None
            }), 200

        return jsonify({"authenticated": False}), 401

    except Exception as e:
        print(f"Session validation error: {str(e)}", flush=True)
        return jsonify({"error": "Validation failed"}), 500

@auth_bp.route('/clear-permissions-cache', methods=['POST'])
@jwt_required()
async def clear_permissions_cache():
    """Clear permissions cache endpoint"""
    try:
        current_user = get_jwt_identity()
        
        # Only users with special permissions
        has_permission = await AuthService.check_edit_permission(current_user)
        if not has_permission:
            return jsonify({"error": "Insufficient permissions"}), 403

        user_to_clear = request.json.get('user_id') if request.json else None
        AuthService.clear_permissions_cache(user_to_clear)
        
        return jsonify({
            "success": True,
            "message": f"Cache cleared successfully{' for user ' + user_to_clear if user_to_clear else ''}"
        })

    except Exception as e:
        logging.error(f"Error in clear_permissions_cache: {str(e)}")
        return jsonify({"error": "Error clearing cache"}), 500

@auth_bp.route('/debug', methods=['GET'])
def debug_auth():
    """Debug endpoint to check authentication state and headers"""
    try:
        return jsonify({
            'cookies': dict(request.cookies),
            'headers': dict(request.headers),
            'origin': request.origin,
            'user_agent': request.user_agent.string,
            'remote_addr': request.remote_addr,
            'scheme': request.scheme,
            'is_secure': request.is_secure,
            'cors_origins': current_app.config['CORS_ORIGINS']
        })
    except Exception as e:
        logging.error(f"Debug endpoint error: {str(e)}")
        return jsonify({"error": "Error in debug endpoint"}), 500

@auth_bp.route('/test-cookie', methods=['GET'])
def test_cookie():
    """Test endpoint to verify cookie functionality"""
    try:
        # Log all incoming data
        logger.info("=== Test Cookie Request ===")
        logger.info(f"Cookies received: {dict(request.cookies)}")
        logger.info(f"Headers: {dict(request.headers)}")
        logger.info(f"Origin: {request.headers.get('Origin')}")
        logger.info(f"User Agent: {request.user_agent.string}")
        
        # Get the origin
        origin = request.headers.get('Origin')
        if not origin and current_app.debug:
            origin = request.headers.get('Host', 'http://localhost:3000')
            if not origin.startswith('http'):
                origin = f"http://{origin}"
            logger.info(f"Debug mode: Setting default origin to {origin}")
        
        # Determine cookie settings based on environment
        is_development = current_app.debug
        cookie_settings = {
            'secure': not is_development,  # True in production, False in development
            'httponly': True,
            'samesite': 'Lax' if is_development else 'None',
            'max_age': 3600,
            'path': '/',
            'domain': None  # Let the browser set the domain
        }
        
        response = jsonify({
            'message': 'Setting test cookie',
            'cookies_received': dict(request.cookies),
            'headers': dict(request.headers),
            'origin': origin,
            'is_secure': request.is_secure,
            'scheme': request.scheme,
            'debug_info': {
                'app_debug': current_app.debug,
                'cookie_settings': cookie_settings,
                'effective_origin': origin
            }
        })
        
        # Set CORS headers
        if origin:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
        
        # Set test cookie
        response.set_cookie('test_cookie', 'test_value', **cookie_settings)
        
        # Log response details
        logger.info("=== Test Cookie Response ===")
        logger.info(f"Response headers: {dict(response.headers)}")
        logger.info(f"Cookie settings: {cookie_settings}")
        logger.info(f"Effective origin: {origin}")
        
        return response
    except Exception as e:
        logger.error(f"Test cookie error: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to set test cookie", "details": str(e)}), 500

