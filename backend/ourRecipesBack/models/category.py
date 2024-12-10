from datetime import datetime
from sqlalchemy.sql import func
from sqlalchemy.exc import OperationalError
import time
from ..extensions import db
from .recipe_categories import recipe_categories

class Category(db.Model):
    """
    Category model with hierarchical support and metadata.
    Handles recipe categorization with parent-child relationships.
    """
    __tablename__ = 'category'
    
    # Basic fields
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    
    # Hierarchy support
    parent_id = db.Column(db.Integer, db.ForeignKey('category.id'))
    level = db.Column(db.Integer)
    path = db.Column(db.String(500))  # Full category path
    
    # Metadata
    description = db.Column(db.Text)
    icon = db.Column(db.String(100))
    display_order = db.Column(db.Integer)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=func.now())
    
    # Relationships
    recipes = db.relationship(
        'Recipe',
        secondary=recipe_categories,
        back_populates='categories',
        lazy='dynamic'
    )
    
    children = db.relationship(
        'Category',
        backref=db.backref('parent', remote_side=[id]),
        lazy=True
    )

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
        """
        Get existing category or create new one with retry mechanism.
        
        Args:
            name (str): Category name
            max_retries (int): Maximum number of retries for locked database
            
        Returns:
            Category: Retrieved or created category instance
        """
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
        """
        Sync categories from recipe content.
        Extracts categories from recipe text and ensures they exist in the database.
        
        Returns:
            bool: Success status of the sync operation
        """
        try:
            from .recipe import Recipe  # Import here to avoid circular imports
            
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

    def to_dict(self):
        """Convert category to dictionary format"""
        return {
            'id': self.id,
            'name': self.name,
            'path': self.path,
            'level': self.level,
            'description': self.description,
            'icon': self.icon,
            'display_order': self.display_order,
            'is_active': self.is_active,
            'recipe_count': self.recipes.count()
        }

    def __repr__(self):
        return f'<Category {self.name}>'