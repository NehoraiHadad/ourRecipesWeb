from datetime import datetime, timezone
from sqlalchemy.sql import func
from .extensions import db
import base64
from enum import Enum

# Add Enums at the top of the file
class RecipeStatus(Enum):
    ACTIVE = 'active'
    ARCHIVED = 'archived'
    DELETED = 'deleted'

class RecipeDifficulty(Enum):
    EASY = 'easy'
    MEDIUM = 'medium'
    HARD = 'hard'

class SyncStatus(Enum):
    SUCCESS = 'success'
    FAILED = 'failed'
    PENDING = 'pending'
    IN_PROGRESS = 'in_progress'

class QueueStatus(Enum):
    PENDING = 'pending'
    COMPLETED = 'completed'
    FAILED = 'failed'

class QueueActionType(Enum):
    CREATE = 'create'
    UPDATE = 'update'
    DELETE = 'delete'

class Recipe(db.Model):
    """
    Recipe model that handles various edge cases and flexible content structure
    """
    id = db.Column(db.Integer, primary_key=True)
    telegram_id = db.Column(db.Integer, unique=True, index=True)
    
    # Basic recipe info
    title = db.Column(db.String(500))  # Allow longer titles
    raw_content = db.Column(db.Text, nullable=False)  # Original unprocessed content
    
    # Structured content
    ingredients = db.Column(db.Text)  # Optional structured ingredients
    instructions = db.Column(db.Text)  # Optional structured instructions
    recipe_metadata = db.Column(db.JSON)
    
    # Media handling
    image_data = db.Column(db.LargeBinary)
    image_url = db.Column(db.String(500))
    media_type = db.Column(db.String(50))
    
    # Timestamps and tracking
    created_at = db.Column(db.DateTime, nullable=False, default=func.now())
    updated_at = db.Column(db.DateTime, onupdate=func.now())
    last_sync = db.Column(db.DateTime)
    
    # Organization
    category_id = db.Column(db.Integer, db.ForeignKey('category.id'))
    tags = db.Column(db.JSON, default=list)
    
    # Status and validation
    is_parsed = db.Column(db.Boolean, default=False)
    parse_errors = db.Column(db.Text)
    status = db.Column(db.String(20), default='active')
    
    # Recipe details
    ingredients_list = db.Column(db.JSON)
    cooking_time = db.Column(db.Integer)
    difficulty = db.Column(db.String(20))
    servings = db.Column(db.Integer)
    
    # Content and sync status
    formatted_content = db.Column(db.JSON)
    is_verified = db.Column(db.Boolean, default=False)
    sync_status = db.Column(db.String(20))
    sync_error = db.Column(db.Text)
    
    # Relationships
    versions = db.relationship('RecipeVersion', backref='recipe', lazy=True)
    user_data = db.relationship('UserRecipe', backref='recipe', lazy=True)
    
    def __init__(self, telegram_id, raw_content, **kwargs):
        self.telegram_id = telegram_id
        self.raw_content = raw_content
        self.created_at = datetime.now(timezone.utc)
        for key, value in kwargs.items():
            setattr(self, key, value)

    @property
    def image(self):
        """
        Returns the image in the most efficient format available
        """
        if self.image_url:
            return {'type': 'url', 'data': self.image_url}
        elif self.image_data:
            image_b64 = base64.b64encode(self.image_data).decode('utf-8')
            return {'type': 'base64', 'data': f"data:image/jpeg;base64,{image_b64}"}
        return None

    def set_image(self, image_data=None, image_url=None):
        """
        Sets the image either from binary data or URL
        """
        if image_url:
            self.image_url = image_url
            self.image_data = None
            self.media_type = 'image_url'
        elif image_data:
            self.image_data = image_data
            self.image_url = None
            self.media_type = 'image_data'
        else:
            self.image_data = None
            self.image_url = None
            self.media_type = 'none'

    def validate(self):
        """Validate recipe status and difficulty"""
        if self.status and self.status not in [s.value for s in RecipeStatus]:
            raise ValueError(f"Invalid status: {self.status}")
        if self.difficulty and self.difficulty not in [d.value for d in RecipeDifficulty]:
            raise ValueError(f"Invalid difficulty: {self.difficulty}")

class Category(db.Model):
    """
    Category model with hierarchical support
    """
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('category.id'))
    created_at = db.Column(db.DateTime, nullable=False, default=func.now())
    
    # Relationships
    recipes = db.relationship('Recipe', backref='category', lazy=True)
    children = db.relationship(
        'Category',
        backref=db.backref('parent', remote_side=[id]),
        lazy=True
    )
    
    # Add hierarchy support
    level = db.Column(db.Integer)
    path = db.Column(db.String(500))  # Store full category path
    
    # Add metadata
    description = db.Column(db.Text)
    icon = db.Column(db.String(100))
    display_order = db.Column(db.Integer)
    
    # Add validation
    is_active = db.Column(db.Boolean, default=True)
    
    def update_path(self):
        """Update the full path of the category"""
        if self.parent:
            self.path = f"{self.parent.path}/{self.name}"
            self.level = self.parent.level + 1
        else:
            self.path = self.name
            self.level = 0

class SyncLog(db.Model):
    """
    Detailed sync logging for debugging and monitoring
    """
    id = db.Column(db.Integer, primary_key=True)
    started_at = db.Column(db.DateTime, nullable=False, default=func.now())
    completed_at = db.Column(db.DateTime)
    status = db.Column(db.String(20), nullable=False)  # 'success', 'failed', 'in_progress'
    
    # Detailed logging
    details = db.Column(db.Text)
    error_message = db.Column(db.Text)
    sync_type = db.Column(db.String(50))  # full/partial/initial
    
    # Statistics
    recipes_processed = db.Column(db.Integer, default=0)
    recipes_failed = db.Column(db.Integer, default=0)
    recipes_added = db.Column(db.Integer, default=0)
    recipes_updated = db.Column(db.Integer, default=0)

    def __init__(self, sync_type='full'):
        self.started_at = datetime.now(timezone.utc)
        self.status = 'in_progress'
        self.sync_type = sync_type

class UserRecipe(db.Model):
    """For user-specific recipe data like favorites"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String, nullable=False)
    recipe_id = db.Column(db.Integer, db.ForeignKey('recipe.id'))
    is_favorite = db.Column(db.Boolean, default=False)
    personal_notes = db.Column(db.Text)
    last_viewed = db.Column(db.DateTime)
    
    __table_args__ = (db.UniqueConstraint('user_id', 'recipe_id'),)

class RecipeVersion(db.Model):
    """Track recipe changes"""
    id = db.Column(db.Integer, primary_key=True)
    recipe_id = db.Column(db.Integer, db.ForeignKey('recipe.id'))
    version_num = db.Column(db.Integer, nullable=False)
    content = db.Column(db.JSON)  # Store full recipe state
    created_at = db.Column(db.DateTime, default=func.now())
    created_by = db.Column(db.String)
    change_description = db.Column(db.Text)

class SyncQueue(db.Model):
    """Queue for offline changes"""
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
    
    def __init__(self, user_id, action_type, recipe_id, **kwargs):
        """Initialize with default status"""
        super().__init__(**kwargs)
        self.user_id = user_id
        self.action_type = action_type
        self.recipe_id = recipe_id
        self.status = QueueStatus.PENDING.value  # Set default status explicitly