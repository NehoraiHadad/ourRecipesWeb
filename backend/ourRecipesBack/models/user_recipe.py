from ..extensions import db
from datetime import datetime, timezone

class UserRecipe(db.Model):
    __tablename__ = 'user_recipes'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(50), nullable=False)
    recipe_id = db.Column(db.Integer, db.ForeignKey('recipes.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    is_favorite = db.Column(db.Boolean, default=False)

    recipe = db.relationship('Recipe', 
                           back_populates='user_recipes',
                           lazy='joined')

    __table_args__ = (
        db.Index('idx_user_recipe', user_id, recipe_id),
    )