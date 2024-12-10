from datetime import datetime, timezone
from sqlalchemy.sql import func
import base64
from ..extensions import db
from .enums import RecipeStatus, RecipeDifficulty
from .recipe_categories import recipe_categories
from .version import RecipeVersion
from .user_recipe import UserRecipe

class Recipe(db.Model):
    """
    Recipe model that handles recipe data, versioning, and content management.
    Supports structured and unstructured content, image handling, and categorization.
    """
    __tablename__ = 'recipes'
    # Basic identification
    id = db.Column(db.Integer, primary_key=True)
    telegram_id = db.Column(db.Integer, unique=True, index=True)
    
    # Core content
    title = db.Column(db.String(500))
    raw_content = db.Column(db.Text, nullable=False)
    _ingredients = db.Column('ingredients', db.Text)
    _instructions = db.Column('instructions', db.Text)
    recipe_metadata = db.Column(db.JSON)
    
    # Media
    image_data = db.Column(db.LargeBinary)
    image_url = db.Column(db.String(500))
    media_type = db.Column(db.String(50))
    
    # Timestamps
    created_at = db.Column(db.DateTime, nullable=False, default=func.now())
    updated_at = db.Column(db.DateTime, onupdate=func.now())
    last_sync = db.Column(db.DateTime)
    
    # Categories and organization
    category_id = db.Column(db.Integer, db.ForeignKey('category.id'))
    tags = db.Column(db.JSON, default=list)
    
    # Status flags
    is_parsed = db.Column(db.Boolean, default=False)
    parse_errors = db.Column(db.Text)
    status = db.Column(db.String(20), default=RecipeStatus.ACTIVE.value)
    
    # Recipe details
    ingredients_list = db.Column(db.JSON)
    cooking_time = db.Column(db.Integer)
    difficulty = db.Column(db.String(20))
    servings = db.Column(db.Integer)
    
    # Sync status
    formatted_content = db.Column(db.JSON)
    is_verified = db.Column(db.Boolean, default=False)
    sync_status = db.Column(db.String(20), default='synced')
    sync_error = db.Column(db.Text)
    
    # Relationships
    user_recipes = db.relationship('UserRecipe',
                                 back_populates='recipe',
                                 cascade='all, delete-orphan')
    
    categories = db.relationship(
        'Category',
        secondary=recipe_categories,
        back_populates='recipes',
        lazy='joined'
    )

    versions = db.relationship(
        'RecipeVersion',
        back_populates='recipe',
        cascade='all, delete-orphan',
        lazy='dynamic',
        primaryjoin="Recipe.id == RecipeVersion.recipe_id"
    )

    def __init__(self, telegram_id, raw_content, **kwargs):
        """Initialize a new recipe"""
        self.telegram_id = telegram_id
        self.raw_content = raw_content
        self.created_at = datetime.now(timezone.utc)
        for key, value in kwargs.items():
            setattr(self, key, value)

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

    def update_content(self, title, raw_content, image_data=None, created_by=None, change_description=None):
        """Update recipe content and create new version"""
        try:
            # Clean up old versions
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
            
            # Parse content
            if raw_content:
                try:
                    self._parse_content(raw_content)
                except Exception as e:
                    self.sync_status = 'error'
                    self.sync_error = str(e)
                    raise
            
            db.session.commit()
            
        except Exception as e:
            db.session.rollback()
            print(f"Error in update_content: {str(e)}")
            raise

    def _parse_content(self, raw_content):
        """Parse raw content and extract structured data"""
        recipe_parts = raw_content.split('\n')
        self.categories = []
        
        for part in recipe_parts:
            if part.strip().startswith('קטגוריות:'):
                categories = part.replace('קטגוריות:', '').split(',')
                categories = [cat.strip() for cat in categories if cat.strip()]
                for category_name in categories:
                    from .category import Category
                    category = Category.get_or_create(category_name)
                    if category not in self.categories:
                        self.categories.append(category)
        
        self.sync_status = 'synced'

    # Image handling methods
    def set_image(self, image_data=None, image_url=None):
        """Set recipe image from data or URL"""
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
            self.media_type = None

    def get_image_url(self):
        """Get image URL (base64 or direct URL)"""
        if self.image_data:
            return f"data:image/jpeg;base64,{base64.b64encode(self.image_data).decode('utf-8')}"
        return self.image_url

    # Version management methods
    def cleanup_versions(self):
        """Keep only the 3 most recent versions"""
        versions = RecipeVersion.query.filter_by(recipe_id=self.id)\
            .order_by(RecipeVersion.version_num.desc()).all()
        if len(versions) >= 3:
            for old_version in versions[2:]:
                db.session.delete(old_version)

    # Validation methods
    def validate(self):
        """Validate recipe data"""
        if self.status and self.status not in [s.value for s in RecipeStatus]:
            raise ValueError(f"Invalid status: {self.status}")
        if self.difficulty and self.difficulty not in [d.value for d in RecipeDifficulty]:
            raise ValueError(f"Invalid difficulty: {self.difficulty}")

    def __repr__(self):
        return f'<Recipe {self.title or self.telegram_id}>' 