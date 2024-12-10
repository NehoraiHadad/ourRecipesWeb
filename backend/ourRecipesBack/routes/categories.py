from flask import jsonify, session
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.category import Category
from ..models.recipe import Recipe
from flask import Blueprint

categories_bp = Blueprint('categories', __name__)

@categories_bp.route('', methods=['GET'])
@jwt_required()
def get_categories():
    """Get all active categories"""
    try:
        categories = Category.query.filter_by(is_active=True).order_by(Category.name).all()
        categories_list = [category.name for category in categories]
        return jsonify(categories_list), 200

    except Exception as e:
        print(f"Error fetching categories: {str(e)}", flush=True)
        return jsonify({"error": "Failed to fetch categories"}), 500

@categories_bp.route('/sync', methods=['POST'])
@jwt_required()
def sync_categories():
    """Sync categories from recipe content"""
    try:
        # Verify edit permissions
        current_user = get_jwt_identity()
        if current_user == "guest" or not session.get("edit_permission"):
            return jsonify({"error": "Unauthorized"}), 403

        success = Category.sync_categories_from_recipes()
        if not success:
            return jsonify({"error": "Failed to sync categories"}), 500
            
        return jsonify({"message": "Categories synced successfully"}), 200

    except Exception as e:
        print(f"Error in sync_categories: {str(e)}", flush=True)
        return jsonify({"error": "Sync failed"}), 500

@categories_bp.route('/status', methods=['GET'])
@jwt_required()
def get_categories_status():
    """Get categories statistics and status"""
    try:
        stats = {
            "total_count": Category.query.count(),
            "active_count": Category.query.filter_by(is_active=True).count(),
            "sample_categories": [cat.name for cat in Category.query.limit(5).all()]
        }
        return jsonify(stats), 200
        
    except Exception as e:
        print(f"Error getting category status: {str(e)}", flush=True)
        return jsonify({"error": "Failed to get status"}), 500

@categories_bp.route('/initialize', methods=['POST'])
@jwt_required()
def initialize_categories():
    """Initialize categories from existing recipes"""
    try:
        if Category.query.count() > 0:
            return jsonify({"message": "Categories already exist"}), 200
            
        categories_set = _extract_categories_from_recipes()
        if not categories_set:
            return jsonify({"error": "No categories found in recipes"}), 404
            
        _create_categories(categories_set)
        return jsonify({"message": f"Initialized {len(categories_set)} categories"}), 200
            
    except Exception as e:
        db.session.rollback()
        print(f"Error initializing categories: {str(e)}", flush=True)
        return jsonify({"error": "Initialization failed"}), 500

# Helper functions
def _extract_categories_from_recipes():
    """Extract unique categories from all recipes"""
    categories_set = set()
    recipes = Recipe.query.all()
    
    for recipe in recipes:
        if not recipe.raw_content:
            continue
            
        recipe_parts = recipe.raw_content.split('\n')
        for part in recipe_parts:
            if part.strip().startswith('קטגוריות:'):
                categories = part.replace('קטגוריות:', '').split(',')
                categories_set.update(cat.strip() for cat in categories if cat.strip())
                
    return categories_set

def _create_categories(categories_set):
    """Create category records in database"""
    for category_name in categories_set:
        category = Category(name=category_name, is_active=True)
        db.session.add(category)
    db.session.commit() 