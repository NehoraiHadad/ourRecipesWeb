from ..extensions import db

# Association table for recipe-category many-to-many relationship
recipe_categories = db.Table(
    "recipe_categories",
    db.Column(
        "recipe_id",
        db.Integer,
        db.ForeignKey("recipes.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    db.Column(
        "category_id",
        db.Integer,
        db.ForeignKey("category.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)
