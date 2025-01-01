from datetime import datetime
from ..extensions import db
from sqlalchemy.sql import func

class Place(db.Model):
    """Model for recommended places"""
    __tablename__ = 'places'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    website = db.Column(db.String(255))
    description = db.Column(db.Text)
    location = db.Column(db.String(255))
    waze_link = db.Column(db.String(255))
    type = db.Column(db.String(50))
    created_by = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    telegram_message_id = db.Column(db.Integer)
    is_synced = db.Column(db.Boolean, default=False)
    last_sync = db.Column(db.DateTime)
    is_deleted = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'website': self.website,
            'description': self.description,
            'location': self.location,
            'waze_link': self.waze_link,
            'type': self.type,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_synced': self.is_synced,
            'last_sync': self.last_sync.isoformat() if self.last_sync else None,
            'is_deleted': self.is_deleted
        }

    def __repr__(self):
        return f'<Place {self.name}>'

    @classmethod
    def get_unsynced(cls):
        """Get all places that haven't been synced with Telegram"""
        return cls.query.filter_by(is_synced=False).all()

    def mark_as_synced(self, telegram_message_id=None):
        """Mark the place as synced with Telegram"""
        if telegram_message_id:
            self.telegram_message_id = telegram_message_id
        self.is_synced = True
        self.last_sync = func.now()
        db.session.commit()

    def mark_as_unsynced(self):
        """Mark the place as not synced with Telegram"""
        self.is_synced = False
        db.session.commit()

    @classmethod
    def get_by_telegram_message_id(cls, telegram_message_id):
        """Get a place by its Telegram message ID"""
        return cls.query.filter_by(telegram_message_id=telegram_message_id).first()

    def format_telegram_message(self):
        """Format the place data for Telegram message"""
        type_emoji = {
            'restaurant': '🍽️',
            'cafe': '☕',
            'bar': '🍺',
            'attraction': '🎡',
            'shopping': '🛍️',
            'other': '📍'
        }
        emoji = type_emoji.get(self.type, '📍')
        
        return (
            f"{emoji} המלצה\n\n"
            f"שם: {self.name}\n"
            f"סוג: {self.type or 'לא צוין'}\n"
            f"אתר: {self.website or 'לא צוין'}\n"
            f"מיקום: {self.location or 'לא צוין'}\n"
            f"Waze: {self.waze_link or 'לא צוין'}\n"
            f"תיאור: {self.description or 'לא צוין'}\n"
            f"נוסף על ידי: {self.created_by}"
        ) 