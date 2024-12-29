from datetime import datetime
from sqlalchemy.sql import func
import base64
from ..extensions import db

class RecipeVersion(db.Model):
    """Track recipe changes"""
    __tablename__ = 'recipe_versions'
    
    id = db.Column(db.Integer, primary_key=True)
    recipe_id = db.Column(db.Integer, db.ForeignKey('recipes.id', ondelete='CASCADE'), nullable=False)
    version_num = db.Column(db.Integer)
    content = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, nullable=False, default=func.now())
    created_by = db.Column(db.String(100))
    change_description = db.Column(db.Text)
    is_current = db.Column(db.Boolean, default=False)
    image_data = db.Column(db.LargeBinary)
    
    recipe = db.relationship('Recipe', back_populates='versions')

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.version_num:
            last_version = RecipeVersion.query.filter_by(recipe_id=self.recipe_id)\
                .order_by(RecipeVersion.version_num.desc()).first()
            self.version_num = (last_version.version_num + 1) if last_version else 1

    def to_dict(self):
        """Convert version to dictionary format"""
        return {
            'id': self.id,
            'version_num': self.version_num,
            'content': self.content,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by,
            'change_description': self.change_description,
            'is_current': self.is_current
        }