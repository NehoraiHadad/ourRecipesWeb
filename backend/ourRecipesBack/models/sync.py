from datetime import datetime, timezone
from sqlalchemy.sql import func
from ..extensions import db
from .enums import QueueStatus, QueueActionType, SyncStatus

class SyncLog(db.Model):
    """Track synchronization operations between database and Telegram"""
    id = db.Column(db.Integer, primary_key=True)
    started_at = db.Column(db.DateTime, nullable=False, default=func.now())
    completed_at = db.Column(db.DateTime)
    status = db.Column(db.String(20), nullable=False)  # Using SyncStatus enum
    
    # Detailed logging
    details = db.Column(db.Text)
    error_message = db.Column(db.Text)
    sync_type = db.Column(db.String(50))  # full/partial/initial
    
    # Recipe statistics
    recipes_processed = db.Column(db.Integer, default=0)
    recipes_failed = db.Column(db.Integer, default=0)
    recipes_added = db.Column(db.Integer, default=0)
    recipes_updated = db.Column(db.Integer, default=0)

    # Place statistics
    places_processed = db.Column(db.Integer, default=0)
    places_failed = db.Column(db.Integer, default=0)

    # Menu statistics
    menus_processed = db.Column(db.Integer, default=0)
    menus_failed = db.Column(db.Integer, default=0)
    menus_added = db.Column(db.Integer, default=0)
    menus_updated = db.Column(db.Integer, default=0)

    def __init__(self, sync_type='full'):
        self.started_at = datetime.now(timezone.utc)
        self.status = SyncStatus.IN_PROGRESS.value
        self.sync_type = sync_type

class SyncQueue(db.Model):
    """Queue for managing offline changes"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String, nullable=False)
    action_type = db.Column(
        db.String,
        nullable=False,
        default=QueueActionType.CREATE.value
    )
    recipe_id = db.Column(db.Integer)
    data = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=func.now())
    status = db.Column(
        db.String,
        nullable=False,
        default=QueueStatus.PENDING.value
    )

    __table_args__ = (
        db.Index('idx_sync_queue_status', 'status'),
        db.Index('idx_sync_queue_user', 'user_id'),
        db.Index('idx_sync_queue_recipe', 'recipe_id'),
    )

    def validate(self):
        """Validate queue entry data"""
        if self.action_type not in [a.value for a in QueueActionType]:
            raise ValueError(f"Invalid action type: {self.action_type}")
        if self.status not in [s.value for s in QueueStatus]:
            raise ValueError(f"Invalid status: {self.status}")
    
    def mark_completed(self, success=True):
        """Mark queue entry as completed"""
        self.status = QueueStatus.COMPLETED.value if success else QueueStatus.FAILED.value 