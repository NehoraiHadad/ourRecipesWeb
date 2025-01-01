from datetime import datetime, timezone
from flask import jsonify, current_app
from flask_jwt_extended import jwt_required
from ..extensions import db
from ..models.sync import SyncLog
from ..services.telegram_service import telegram_service
from ..services.recipe_service import RecipeService
from ..models.place import Place
from ..models import Recipe
import logging
from flask import Blueprint

sync_bp = Blueprint("sync", __name__)
logger = logging.getLogger(__name__)


@sync_bp.route("/status", methods=["GET"])
@jwt_required()
def get_sync_status():
    """Get sync status for recipes and places"""
    try:
        # Get recipes sync status
        total_recipes = Recipe.query.count()
        synced_recipes = Recipe.query.filter(Recipe.last_sync.isnot(None)).count()
        unsynced_recipes = total_recipes - synced_recipes

        # Get places sync status
        total_places = Place.query.count()
        synced_places = Place.query.filter_by(is_synced=True).count()
        unsynced_places = total_places - synced_places

        return jsonify(
            {
                "recipes": {
                    "total": total_recipes,
                    "synced": synced_recipes,
                    "unsynced": unsynced_recipes,
                },
                "places": {
                    "total": total_places,
                    "synced": synced_places,
                    "unsynced": unsynced_places,
                },
            }
        )
    except Exception as e:
        logger.error(f"Error getting sync status: {str(e)}")
        return jsonify({"error": "Failed to get sync status"}), 500


@sync_bp.route("", methods=["POST"])
@jwt_required()
async def sync_all():
    """Sync all unsynced recipes and places with Telegram"""
    # Initialize sync log
    sync_log = _create_sync_log()

    try:
        # Perform sync
        await _perform_sync(sync_log)

        # Mark sync as completed
        _complete_sync(sync_log)

        return jsonify({"status": "success", "stats": _get_sync_stats(sync_log)}), 200

    except Exception as sync_error:
        _handle_sync_error(sync_log, sync_error)
        print(f"Sync error: {str(sync_error)}", flush=True)
        return jsonify({"status": "error", "message": str(sync_error)}), 500


# Helper functions
def _create_sync_log():
    """Create and initialize sync log"""
    sync_log = SyncLog(sync_type="full")
    db.session.add(sync_log)
    db.session.commit()
    return sync_log


async def _perform_sync(sync_log):
    """Perform actual sync operation - read from Telegram and update DB"""
    client = await telegram_service.create_client()
    async with client:
        # Get channel entity
        channel_entity = await client.get_entity(current_app.config["CHANNEL_URL"])
        messages = await client.get_messages(channel_entity, limit=None)

        for message in messages:
            try:
                # Skip if message has no text
                if not message.text:
                    continue

                # Check if this is a place recommendation by looking for "סוג:" field
                is_place = "המלצה" in message.text

                # If it's not a place, check if it's a recipe by looking for recipe-specific fields
                is_recipe = not is_place 

                if is_place:
                    # Process place recommendation
                    existing_place = Place.query.filter_by(telegram_message_id=message.id).first()
                    if existing_place:
                        if not existing_place.is_synced:
                            existing_place.mark_as_synced(message.id)
                        continue

                    # Skip if message indicates deletion
                    if "❌ נמחק על ידי:" in message.text:
                        continue

                    # Parse place data from message
                    place_data = _parse_place_from_message(message.text)
                    if place_data:
                        place = Place(**place_data, telegram_message_id=message.id)
                        db.session.add(place)
                        place.mark_as_synced(message.id)
                        sync_log.places_processed += 1
                        logger.info(f"Place from message {message.id} synced successfully")

                elif is_recipe:
                    # Process recipe
                    await RecipeService.sync_message(client, message, sync_log)
                    sync_log.recipes_processed += 1
                    logger.info(f"Recipe message {message.id} synced successfully")

                else:
                    # Skip messages that are neither places nor recipes
                    logger.info(f"Message {message.id} skipped - not a place or recipe")
                    continue

            except Exception as e:
                if is_place:
                    sync_log.places_failed += 1
                    logger.error(f"Error processing place message {message.id}: {str(e)}")
                elif is_recipe:
                    sync_log.recipes_failed += 1
                    logger.error(f"Error processing recipe message {message.id}: {str(e)}")
                else:
                    logger.error(f"Error processing message {message.id}: {str(e)}")

        db.session.commit()


def _parse_place_from_message(text):
    """Parse place data from Telegram message text"""
    try:
        lines = text.split("\n")
        data = {}

        # Parse fields
        for line in lines:
            if ":" not in line:
                continue

            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip()

            if value == "לא צוין":
                continue

            if "סוג" in key:
                data["type"] = value.lower()
            elif "שם" in key:
                data["name"] = value
            elif "אתר" in key:
                data["website"] = value
            elif "מיקום" in key:
                data["location"] = value
            elif "Waze" in key:
                data["waze_link"] = value
            elif "תיאור" in key:
                data["description"] = value
            elif "נוסף על ידי" in key:
                data["created_by"] = value

        # Name is required
        if "name" not in data:
            return None

        return data
    except Exception as e:
        logger.error(f"Error parsing place message: {str(e)}")
        return None


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
        "recipes": {
            "processed": sync_log.recipes_processed,
            "added": sync_log.recipes_added,
            "updated": sync_log.recipes_updated,
            "failed": sync_log.recipes_failed,
        },
        "places": {
            "processed": sync_log.places_processed,
            "failed": sync_log.places_failed,
        },
    }
