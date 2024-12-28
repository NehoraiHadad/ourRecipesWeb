from flask import current_app, jsonify, request, session
from flask_jwt_extended import jwt_required, get_jwt_identity, set_access_cookies
from ..services.auth_service import AuthService
from flask import Blueprint
from datetime import datetime, timezone
import uuid
import logging

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['POST'])
async def login():
    """Handle Telegram login"""
    try:
        user_data = request.json
        print(f"Login attempt with data: {user_data}", flush=True)
        
        if not user_data or not user_data.get("id"):
            return jsonify({"error": "נתוני משתמש לא תקינים"}), 400

        user_id = str(user_data["id"])

        # Verify Telegram authentication
        if not AuthService.verify_telegram_login(user_data):
            return jsonify({"error": "אימות נכשל"}), 401

        # בדיקת הרשאות בטלגרם
        has_permission = await AuthService.check_edit_permission(user_id)
        
        # יצירת סשן עם מידע מורחב
        session["user_id"] = user_id
        session["auth_type"] = "telegram"
        session["login_time"] = datetime.now(timezone.utc).isoformat()
        session["edit_permission"] = has_permission
        
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
            }
        })
        set_access_cookies(response, access_token)
        
        return response

    except Exception as e:
        print(f"Login error: {str(e)}", flush=True)
        return jsonify({"error": "התחברות נכשלה"}), 500

@auth_bp.route('/guest', methods=['POST'])
def login_guest():
    """Handle guest login"""
    try:
        guest_id = f"guest_{uuid.uuid4().hex[:8]}"
        
        session["user_id"] = guest_id
        session["auth_type"] = "guest"
        session["login_time"] = datetime.now(timezone.utc).isoformat()
        session["edit_permission"] = False
        
        access_token = AuthService.create_guest_session(guest_id)

        response = jsonify({
            "login": True,
            "canEdit": False,
            "user": {
                "id": guest_id,
                "type": "guest"
            }
        })
        set_access_cookies(response, access_token)

        return response

    except Exception as e:
        print(f"Guest login error: {str(e)}", flush=True)
        return jsonify({"error": "התחברות כאורח נכשלה"}), 500

@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Handle user logout"""
    try:
        session.clear()
        return jsonify({"logout": True})
    except Exception as e:
        print(f"Logout error: {str(e)}", flush=True)
        return jsonify({"error": "Logout failed"}), 500

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

        if user_id == "guest":
            session["edit_permission"] = False
            return jsonify({
                "authenticated": True,
                "canEdit": False,
                "user_id": user_id
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
                "user_id": user_id
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

