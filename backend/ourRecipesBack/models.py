from datetime import datetime, timezone
from sqlalchemy.sql import func
from .extensions import db
import base64
from enum import Enum
from sqlalchemy.exc import OperationalError
import time

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

# Add this at the top of the file
recipe_categories = db.Table('recipe_categories',
    db.Column('recipe_id', db.Integer, db.ForeignKey('recipe.id'), primary_key=True),
    db.Column('category_id', db.Integer, db.ForeignKey('category.id'), primary_key=True)
)

class RecipeVersion(db.Model):
    """Track recipe changes"""
    id = db.Column(db.Integer, primary_key=True)
    recipe_id = db.Column(db.Integer, db.ForeignKey('recipe.id'))
    version_num = db.Column(db.Integer, nullable=False)
    content = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=func.now())
    created_by = db.Column(db.String)
    change_description = db.Column(db.String)
    is_current = db.Column(db.Boolean, default=False)
    image_data = db.Column(db.LargeBinary)

    def __init__(self, recipe_id, content, created_by=None, change_description=None, image_data=None):
        self.recipe_id = recipe_id
        self.created_by = created_by
        self.change_description = change_description
        self.image_data = image_data
        
        # Handle image data from content if exists
        if content and isinstance(content, dict):
            if 'image' in content:
                try:
                    # Decode base64 image
                    image_str = content.pop('image')  # Remove image from content
                    if image_str and isinstance(image_str, str):
                        if ',' in image_str:
                            image_str = image_str.split(',')[1]  # Remove data:image/jpeg;base64,
                        self.image_data = base64.b64decode(image_str)
                except Exception as e:
                    print(f"Error processing image: {str(e)}")
                    self.image_data = None
            self.content = content
        else:
            self.content = {}
            self.image_data = None
            
        # Set version number
        last_version = RecipeVersion.query.filter_by(recipe_id=recipe_id).order_by(RecipeVersion.version_num.desc()).first()
        self.version_num = (last_version.version_num + 1) if last_version else 1

    def to_dict(self):
        return {
            'id': self.id,
            'version_num': self.version_num,
            'content': self.content,
            'created_at': self.created_at.isoformat(),
            'created_by': self.created_by,
            'change_description': self.change_description,
            'is_current': self.is_current,
            'image': (f"data:image/jpeg;base64,{base64.b64encode(self.image_data).decode('utf-8')}" 
                     if self.image_data else None)
        }

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
    _ingredients = db.Column('ingredients', db.Text)
    _instructions = db.Column('instructions', db.Text)
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
    sync_status = db.Column(db.String(20), default='synced')  # synced, pending, failed
    sync_error = db.Column(db.Text)
    
    # Relationships
    user_data = db.relationship('UserRecipe', backref='recipe', lazy=True)
    
    # Update the categories relationship
    categories = db.relationship('Category', 
                               secondary=recipe_categories,
                               backref=db.backref('recipes_list', lazy='dynamic'))
    
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

    def set_image(self, image_data):
        """Set the image data for the recipe"""
        self.image_data = image_data

    def has_image(self):
        """Check if the recipe has an image"""
        return self.image_data is not None

    def get_image_url(self):
        """Get base64 encoded image URL if image exists"""
        if self.has_image():
            return f"data:image/jpeg;base64,{base64.b64encode(self.image_data).decode('utf-8')}"
        return None

    def __repr__(self):
        return f'<Recipe {self.title}>'

    def cleanup_versions(self):
        """Clean up old versions, keeping only the 3 most recent ones"""
        versions = RecipeVersion.query.filter_by(recipe_id=self.id).order_by(RecipeVersion.version_num.desc()).all()
        if len(versions) >= 3:
            for old_version in versions[2:]:
                db.session.delete(old_version)

    def update_content(self, title, raw_content, image_data=None, created_by=None, change_description=None):
        """Update recipe content and track changes"""
        try:
            print(f"Creating new version for recipe {self.id} (telegram_id: {self.telegram_id})")
            
            # Clean up old versions first
            self.cleanup_versions()
            
            # Create version content
            version_content = {
                'title': self.title,
                'raw_content': self.raw_content,
                'categories': [cat.name for cat in self.categories],
                'ingredients': self.ingredients if hasattr(self, 'ingredients') else None,
                'instructions': self.instructions if hasattr(self, 'instructions') else None,
            }
            
            # Create new version
            new_version = RecipeVersion(
                recipe_id=self.id,
                content=version_content,
                created_by=created_by,
                change_description=change_description,
                image_data=self.image_data
            )
            db.session.add(new_version)
            
            # Update current recipe
            self.title = title
            self.raw_content = raw_content
            if image_data:
                self.image_data = image_data
            
            # Parse and update structured content
            if raw_content:
                try:
                    recipe_parts = raw_content.split('\n')
                    self.categories = []
                    
                    for part in recipe_parts:
                        if part.strip().startswith('קטגוריות:'):
                            categories = part.replace('קטגוריות:', '').split(',')
                            categories = [cat.strip() for cat in categories if cat.strip()]
                            for category_name in categories:
                                category = Category.get_or_create(category_name)
                                if category not in self.categories:
                                    self.categories.append(category)
                
                    self.sync_status = 'synced'
                    
                except Exception as e:
                    print(f"Error parsing recipe content: {str(e)}")
                    self.sync_status = 'error'
                    self.sync_error = str(e)
                    raise
            
            db.session.commit()
            
        except Exception as e:
            db.session.rollback()
            print(f"Error in update_content: {str(e)}")
            raise

    @property
    def ingredients(self):
        """Get ingredients as a list"""
        return self._ingredients.split('||') if self._ingredients else []
    
    @ingredients.setter
    def ingredients(self, value):
        """Store ingredients as string"""
        if isinstance(value, list):
            self._ingredients = '||'.join(value)
        else:
            self._ingredients = value
    
    @property
    def instructions(self):
        """Get instructions as string"""
        return self._instructions
    
    @instructions.setter
    def instructions(self, value):
        """Store instructions as string"""
        if isinstance(value, list):
            self._instructions = '\n'.join(value)
        else:
            self._instructions = value

class Category(db.Model):
    """
    Category model with hierarchical support
    """
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
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
            parent_path = self.parent.path or self.parent.name
            self.path = f"{parent_path}/{self.name}"
            self.level = (self.parent.level or 0) + 1
        else:
            self.path = self.name
            self.level = 0

    @classmethod
    def get_or_create(cls, name, max_retries=3):
        """Get existing category or create new one with retries"""
        retries = 0
        while retries < max_retries:
            try:
                category = cls.query.filter_by(name=name).first()
                if not category:
                    category = cls(name=name)
                    db.session.add(category)
                    db.session.commit()
                return category
            except OperationalError as e:
                if "database is locked" in str(e):
                    retries += 1
                    if retries == max_retries:
                        raise
                    time.sleep(0.1 * retries)  # Exponential backoff
                    db.session.rollback()
                else:
                    raise

    @classmethod
    def sync_categories_from_recipes(cls):
        """Sync categories from recipe content"""
        from sqlalchemy import text
        
        try:
            # Get all recipes
            recipes = Recipe.query.all()
            new_categories = set()
            
            # Extract categories from recipes
            for recipe in recipes:
                if recipe.raw_content:
                    recipe_parts = recipe.raw_content.split('\n')
                    for part in recipe_parts:
                        if part.strip().startswith('קטגוריות:'):
                            categories = part.replace('קטגוריות:', '').split(',')
                            new_categories.update(cat.strip() for cat in categories if cat.strip())
            
            # Add new categories
            for category_name in new_categories:
                cls.get_or_create(category_name)
            
            return True
        except Exception as e:
            print(f"Error syncing categories: {str(e)}")
            return False

    def __repr__(self):
        return f'<Category {self.name}>'

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

class Restaurant(db.Model):
    """Restaurant recommendations model"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    website = db.Column(db.String(500))
    description = db.Column(db.Text)
    location = db.Column(db.String(500))
    waze_link = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, nullable=False, default=func.now())
    updated_at = db.Column(db.DateTime, onupdate=func.now())
    created_by = db.Column(db.String)
    telegram_message_id = db.Column(db.Integer)  # For backup in Telegram
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'website': self.website,
            'description': self.description,
            'location': self.location,
            'waze_link': self.waze_link,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_by': self.created_by
        }

    def __repr__(self):
        return f'<Restaurant {self.name}>'