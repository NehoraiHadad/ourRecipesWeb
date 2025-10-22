from datetime import datetime, timezone
from sqlalchemy.sql import func
import secrets
from ..extensions import db
from .enums import DietaryType


class Menu(db.Model):
    """
    Menu model representing a complete meal plan for an event.
    Can contain multiple meals (e.g., Friday dinner, Saturday breakfast, etc.)
    """
    __tablename__ = 'menus'

    # Basic identification
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(50), nullable=False, index=True)
    telegram_message_id = db.Column(db.Integer, unique=True, index=True)  # Telegram message ID for sync
    last_sync = db.Column(db.DateTime, nullable=True)  # Last sync time with Telegram

    # Menu details
    name = db.Column(db.String(200), nullable=False)
    event_type = db.Column(db.String(100))  # e.g., "שבת", "חג", "ארוחה משפחתית"
    description = db.Column(db.Text)

    # Preferences
    total_servings = db.Column(db.Integer, default=4)
    dietary_type = db.Column(db.Enum(DietaryType), nullable=True)

    # Sharing
    share_token = db.Column(db.String(32), unique=True, index=True)
    is_public = db.Column(db.Boolean, default=False)

    # AI generation metadata
    ai_reasoning = db.Column(db.Text)  # Store AI's reasoning for the menu
    generation_prompt = db.Column(db.Text)  # Store original request

    # Timestamps
    created_at = db.Column(db.DateTime, nullable=False, default=func.now())
    updated_at = db.Column(db.DateTime, onupdate=func.now())

    # Relationships
    meals = db.relationship(
        'MenuMeal',
        back_populates='menu',
        cascade='all, delete-orphan',
        lazy='joined',
        order_by='MenuMeal.meal_order'
    )

    shopping_list_items = db.relationship(
        'ShoppingListItem',
        back_populates='menu',
        cascade='all, delete-orphan',
        lazy='dynamic'
    )

    def __init__(self, user_id, name, **kwargs):
        """Initialize a new menu"""
        self.user_id = user_id
        self.name = name
        self.created_at = datetime.now(timezone.utc)
        self.share_token = secrets.token_urlsafe(24)
        for key, value in kwargs.items():
            setattr(self, key, value)

    def to_dict(self, include_meals=True):
        """Convert menu to dictionary"""
        data = {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'event_type': self.event_type,
            'description': self.description,
            'total_servings': self.total_servings,
            'dietary_type': self.dietary_type.value if self.dietary_type else None,
            'is_public': self.is_public,
            'share_token': self.share_token,
            'ai_reasoning': self.ai_reasoning,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_meals:
            data['meals'] = [meal.to_dict() for meal in self.meals]

        return data

    def __repr__(self):
        return f'<Menu {self.id}: {self.name}>'


class MenuMeal(db.Model):
    """
    MenuMeal model representing a single meal within a menu.
    E.g., "Friday Dinner", "Saturday Breakfast"
    """
    __tablename__ = 'menu_meals'

    id = db.Column(db.Integer, primary_key=True)
    menu_id = db.Column(db.Integer, db.ForeignKey('menus.id', ondelete='CASCADE'), nullable=False)

    # Meal details
    meal_type = db.Column(db.String(100), nullable=False)  # e.g., "ארוחת ערב שבת"
    meal_order = db.Column(db.Integer, nullable=False)  # Order within the menu
    meal_time = db.Column(db.String(50))  # Optional: e.g., "19:00"
    notes = db.Column(db.Text)

    # Timestamps
    created_at = db.Column(db.DateTime, default=func.now())

    # Relationships
    menu = db.relationship('Menu', back_populates='meals')
    recipes = db.relationship(
        'MealRecipe',
        back_populates='meal',
        cascade='all, delete-orphan',
        lazy='joined',
        order_by='MealRecipe.course_order'
    )

    __table_args__ = (
        db.Index('idx_menu_meal', 'menu_id', 'meal_order'),
    )

    def to_dict(self, include_recipes=True):
        """Convert meal to dictionary"""
        data = {
            'id': self.id,
            'menu_id': self.menu_id,
            'meal_type': self.meal_type,
            'meal_order': self.meal_order,
            'meal_time': self.meal_time,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

        if include_recipes:
            data['recipes'] = [recipe.to_dict() for recipe in self.recipes]

        return data

    def __repr__(self):
        return f'<MenuMeal {self.id}: {self.meal_type}>'


class MealRecipe(db.Model):
    """
    MealRecipe model representing a recipe within a meal.
    Links recipes to specific meals with additional context.
    """
    __tablename__ = 'meal_recipes'

    id = db.Column(db.Integer, primary_key=True)
    menu_meal_id = db.Column(db.Integer, db.ForeignKey('menu_meals.id', ondelete='CASCADE'), nullable=False)
    recipe_id = db.Column(db.Integer, db.ForeignKey('recipes.id', ondelete='CASCADE'), nullable=False)

    # Recipe context within meal
    course_type = db.Column(db.String(100))  # e.g., "מנה ראשונה", "מנה עיקרית"
    course_order = db.Column(db.Integer, default=0)  # Order within the meal
    servings = db.Column(db.Integer)  # Override servings for this specific instance
    notes = db.Column(db.Text)
    ai_reason = db.Column(db.Text)  # AI's reason for selecting this recipe

    # Timestamps
    created_at = db.Column(db.DateTime, default=func.now())

    # Relationships
    meal = db.relationship('MenuMeal', back_populates='recipes')
    recipe = db.relationship('Recipe', lazy='joined')

    __table_args__ = (
        db.Index('idx_meal_recipe', 'menu_meal_id', 'recipe_id'),
    )

    def to_dict(self, include_recipe_details=True):
        """Convert meal recipe to dictionary"""
        data = {
            'id': self.id,
            'menu_meal_id': self.menu_meal_id,
            'recipe_id': self.recipe_id,
            'course_type': self.course_type,
            'course_order': self.course_order,
            'servings': self.servings,
            'notes': self.notes,
            'ai_reason': self.ai_reason,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

        if include_recipe_details and self.recipe:
            # Include basic recipe info
            data['recipe'] = {
                'id': self.recipe.id,
                'title': self.recipe.title,
                'cooking_time': self.recipe.cooking_time,
                'preparation_time': self.recipe.preparation_time,
                'difficulty': self.recipe.difficulty.value if self.recipe.difficulty else None,
                'servings': self.recipe.servings,
                'image_url': self.recipe.image_url,
            }

        return data

    def __repr__(self):
        return f'<MealRecipe {self.id}: Recipe {self.recipe_id} in Meal {self.menu_meal_id}>'
