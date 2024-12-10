from datetime import datetime, timezone
from flask import jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.sync import SyncLog
from ..services.telegram_service import telegram_service
from ..services.recipe_service import RecipeService
from flask import Blueprint

sync_bp = Blueprint('sync', __name__)

@sync_bp.route('', methods=['POST'])
@jwt_required()
async def sync_recipes():
    """Synchronize recipes between database and Telegram"""
    try:
        # Verify permissions
        user_id = get_jwt_identity()
        if user_id == "guest":
            return jsonify({"error": "Unauthorized"}), 403

        # Initialize sync log
        sync_log = _create_sync_log()
        
        try:
            # Perform sync
            await _perform_sync(sync_log)
            
            # Mark sync as completed
            _complete_sync(sync_log)
            
            return jsonify({
                "status": "success",
                "stats": _get_sync_stats(sync_log)
            }), 200

        except Exception as sync_error:
            _handle_sync_error(sync_log, sync_error)
            raise

    except Exception as e:
        print(f"Sync error: {str(e)}", flush=True)
        return jsonify({
            "status": "error", 
            "message": str(e)
        }), 500

# Helper functions
def _create_sync_log():
    """Create and initialize sync log"""
    sync_log = SyncLog(sync_type="full")
    db.session.add(sync_log)
    db.session.commit()
    return sync_log

async def _perform_sync(sync_log):
    """Perform actual sync operation"""
    client = await telegram_service.create_client()
    async with client:
        channel_entity = await client.get_entity(current_app.config["CHANNEL_URL"])
        messages = await client.get_messages(channel_entity, limit=None)
        
        for message in messages:
            try:
                await RecipeService.sync_message(client,message, sync_log)
                sync_log.recipes_processed += 1
            except Exception as e:
                sync_log.recipes_failed += 1
                print(f"Error processing message {message.id}: {str(e)}", flush=True)
                
        db.session.commit()

def _complete_sync(sync_log):
    """Mark sync as completed"""
    sync_log.status = "completed"
    sync_log.completed_at = datetime.now(timezone.utc)
    db.session.commit()

def _handle_sync_error(sync_log, error):
    """Handle sync error"""
    sync_log.status = "failed"
    sync_log.completed_at = datetime.now(timezone.utc)
    sync_log.error_message = str(error)
    db.session.commit()

def _get_sync_stats(sync_log):
    """Get sync statistics"""
    return {
        "processed": sync_log.recipes_processed,
        "added": sync_log.recipes_added,
        "updated": sync_log.recipes_updated,
        "failed": sync_log.recipes_failed
    } 