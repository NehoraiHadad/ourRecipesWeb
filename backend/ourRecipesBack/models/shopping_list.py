from datetime import datetime, timezone
from sqlalchemy.sql import func
from ..extensions import db


class ShoppingListItem(db.Model):
    """
    Shopping list item model representing an ingredient needed for a menu.
    Generated automatically from menu recipes.
    """
    __tablename__ = 'shopping_list_items'

    id = db.Column(db.Integer, primary_key=True)
    menu_id = db.Column(db.Integer, db.ForeignKey('menus.id', ondelete='CASCADE'), nullable=False)

    # Item details
    ingredient_name = db.Column(db.String(200), nullable=False)
    quantity = db.Column(db.String(100))  # e.g., "500 גרם", "2 יחידות"
    category = db.Column(db.String(100))  # e.g., "ירקות", "בשר ודגים", "מוצרי יסוד"

    # User interaction
    is_checked = db.Column(db.Boolean, default=False)
    notes = db.Column(db.Text)

    # Timestamps
    created_at = db.Column(db.DateTime, default=func.now())
    updated_at = db.Column(db.DateTime, onupdate=func.now())

    # Relationships
    menu = db.relationship('Menu', back_populates='shopping_list_items')

    __table_args__ = (
        db.Index('idx_menu_shopping', 'menu_id', 'category'),
    )

    def to_dict(self):
        """Convert shopping list item to dictionary"""
        return {
            'id': self.id,
            'menu_id': self.menu_id,
            'ingredient_name': self.ingredient_name,
            'quantity': self.quantity,
            'category': self.category,
            'is_checked': self.is_checked,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<ShoppingListItem {self.id}: {self.ingredient_name}>'
