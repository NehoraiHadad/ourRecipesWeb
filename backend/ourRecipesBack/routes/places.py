from flask import Blueprint, jsonify, request, session
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..models import Place
from ..extensions import db
from ..services.telegram_service import TelegramService
import asyncio
import logging

places = Blueprint('places', __name__)
logger = logging.getLogger(__name__)

@places.route('', methods=['GET'])
def get_places():
    """Get all recommended places ordered by creation date"""
    try:
        # Get all places and filter out deleted ones using DB data
        places_list = Place.query.filter(Place.is_deleted.is_(False)) \
                               .order_by(Place.created_at.desc()) \
                               .all()
        return jsonify([place.to_dict() for place in places_list])
    except Exception as e:
        logger.error(f"Error getting places: {str(e)}")
        return jsonify({"error": "Failed to get places"}), 500

@places.route('', methods=['POST'])
@jwt_required()
def create_place():
    """Create a new place recommendation"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        if 'name' not in data:
            return jsonify({"error": "Place name is required"}), 400

        user_id = get_jwt_identity()
        user_name = session.get("user_name", user_id)  # Get user's name from session, fallback to ID
        
        logger.info(f"Creating place with data: {data}")
        
        place = Place(
            name=data['name'],
            website=data.get('website'),
            description=data.get('description'),
            location=data.get('location'),
            waze_link=data.get('waze_link'),
            type=data.get('type'),
            created_by=f"{user_name} ({user_id})"  # Store both name and ID
        )
        
        db.session.add(place)
        db.session.commit()
        logger.info(f"Place created with ID: {place.id}")
        
        # Backup to Telegram
        type_emoji = {
            'restaurant': '🍽️',
            'cafe': '☕',
            'bar': '🍺',
            'attraction': '🎡',
            'shopping': '🛍️',
            'other': '📍'
        }
        emoji = type_emoji.get(place.type, '📍')
        
        message = f"{emoji} המלצה חדשה\n\n"\
                  f"שם: {place.name}\n"\
                  f"סוג: {place.type or 'לא צוין'}\n"\
                  f"אתר: {place.website or 'לא צוין'}\n"\
                  f"מיקום: {place.location or 'לא צוין'}\n"\
                  f"Waze: {place.waze_link or 'לא צוין'}\n"\
                  f"תיאור: {place.description or 'לא צוין'}\n"\
                  f"נוסף על ידי: {user_name}"  # Use user's name in Telegram message
        
        try:
            telegram_msg = asyncio.run(TelegramService.send_message(message))
            if telegram_msg and hasattr(telegram_msg, 'id'):
                place.telegram_message_id = telegram_msg.id
                db.session.commit()
                logger.info(f"Telegram message sent with ID: {telegram_msg.id}")
        except Exception as e:
            logger.error(f"Failed to send Telegram message: {str(e)}")
        
        return jsonify(place.to_dict()), 201
    
    except Exception as e:
        logger.error(f"Error creating place: {str(e)}")
        db.session.rollback()
        return jsonify({"error": "Failed to create place"}), 500

@places.route('/<int:id>', methods=['PUT'])
@jwt_required()
def update_place(id):
    """Update an existing place"""
    try:
        place = Place.query.get_or_404(id)
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        place.name = data.get('name', place.name)
        place.website = data.get('website', place.website)
        place.description = data.get('description', place.description)
        place.location = data.get('location', place.location)
        place.waze_link = data.get('waze_link', place.waze_link)
        place.type = data.get('type', place.type)
        
        db.session.commit()
        logger.info(f"Place {id} updated successfully")
        
        # Update Telegram message if exists
        if place.telegram_message_id:
            type_emoji = {
                'restaurant': '🍽️',
                'cafe': '☕',
                'bar': '🍺',
                'attraction': '🎡',
                'shopping': '🛍️',
                'other': '📍'
            }
            emoji = type_emoji.get(place.type, '📍')
            
            message = f"{emoji} המלצה\n\n"\
                      f"שם: {place.name}\n"\
                      f"סוג: {place.type or 'לא צוין'}\n"\
                      f"אתר: {place.website or 'לא צוין'}\n"\
                      f"מיקום: {place.location or 'לא צוין'}\n"\
                      f"Waze: {place.waze_link or 'לא צוין'}\n"\
                      f"תיאור: {place.description or 'לא צוין'}\n"\
                      f"נוסף על ידי: {place.created_by}\n"\
                      f"(עודכן)"
            
            try:
                asyncio.run(TelegramService.edit_message(place.telegram_message_id, message))
                logger.info(f"Telegram message {place.telegram_message_id} updated")
            except Exception as e:
                logger.error(f"Failed to update Telegram message: {str(e)}")
        
        return jsonify(place.to_dict())
    
    except Exception as e:
        logger.error(f"Error updating place {id}: {str(e)}")
        db.session.rollback()
        return jsonify({"error": "Failed to update place"}), 500

@places.route('/<int:place_id>', methods=['DELETE'])
@jwt_required()
def delete_place(place_id):
    try:
        place = Place.query.get_or_404(place_id)
        user_id = get_jwt_identity()
        user_name = session.get("user_name", user_id)

        # Mark as deleted in DB
        place.is_deleted = True
        
        # Update Telegram message if exists
        if place.telegram_message_id:
            message = place.format_telegram_message() + f"\n\n❌ נמחק על ידי: {user_name}"
            try:
                asyncio.run(TelegramService.edit_message(place.telegram_message_id, message))
                logger.info(f"Telegram message {place.telegram_message_id} updated to show deletion")
            except Exception as e:
                logger.error(f"Failed to update Telegram message: {str(e)}")
        
        db.session.commit()
        return '', 204
        
    except Exception as e:
        logger.error(f"Error deleting place: {str(e)}")
        db.session.rollback()
        return jsonify({"error": "Failed to delete place"}), 500 