from flask import jsonify, session
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..models.recipe import Recipe
from flask import Blueprint

categories_bp = Blueprint('categories', __name__)

@categories_bp.route('', methods=['GET'])
@jwt_required()
def get_categories():
    """Get all unique categories from recipes"""
    try:
        categories_set = set()
        recipes = Recipe.query.all()
        
        for recipe in recipes:
            if recipe._categories:
                categories_set.update(recipe.categories)
        
        return jsonify(sorted(list(categories_set))), 200

    except Exception as e:
        print(f"Error fetching categories: {str(e)}", flush=True)
        return jsonify({"error": "Failed to fetch categories"}), 500 