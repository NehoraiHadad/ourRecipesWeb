from flask import jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.recipe import Recipe
from ..models.version import RecipeVersion
from flask import Blueprint
from ..services.telegram_service import telegram_service

versions_bp = Blueprint('versions', __name__)

@versions_bp.route('/recipe/<int:recipe_id>', methods=['GET'])
@jwt_required()
def get_recipe_versions(recipe_id):
    """Get version history for a recipe"""
    try:
        recipe = Recipe.query.filter_by(telegram_id=recipe_id).first()
        if not recipe:
            return jsonify({"error": "Recipe not found"}), 404

        # Clean up old versions before returning
        recipe.cleanup_versions()
        db.session.commit()
        
        versions = RecipeVersion.query.filter_by(recipe_id=recipe.id)\
            .order_by(RecipeVersion.version_num.desc()).all()
        return jsonify([version.to_dict() for version in versions]), 200
            
    except Exception as e:
        print(f"Error handling versions: {str(e)}", flush=True)
        return jsonify({"error": "Failed to get versions"}), 500

@versions_bp.route('/recipe/<int:recipe_id>', methods=['POST'])
@jwt_required()
def create_recipe_version(recipe_id):
    """Create a new version for a recipe"""
    try:
        recipe = Recipe.query.filter_by(telegram_id=recipe_id).first()
        if not recipe:
            return jsonify({"error": "Recipe not found"}), 404

        data = request.get_json()
        if not data or not data.get('content'):
            return jsonify({"error": "Missing content"}), 400
            
        new_version = _create_version(recipe, data)
        versions = _get_recipe_versions(recipe)
        
        return jsonify([version.to_dict() for version in versions]), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Error creating version: {str(e)}", flush=True)
        return jsonify({"error": "Failed to create version"}), 500

@versions_bp.route('/recipe/<int:recipe_id>/restore/<int:version_id>', methods=['POST'])
@jwt_required()
async def restore_recipe_version(recipe_id, version_id):
    """Restore a previous version of a recipe"""
    try:
        print(f"Starting restore for recipe {recipe_id}, version {version_id}", flush=True)
        
        recipe = Recipe.query.filter_by(telegram_id=recipe_id).first()
        if not recipe:
            print(f"Recipe {recipe_id} not found", flush=True)
            return jsonify({"error": "Recipe not found"}), 404

        version = db.session.get(RecipeVersion, version_id)
        if not version or version.recipe_id != recipe.id:
            print(f"Version {version_id} not found for recipe {recipe_id}", flush=True)
            return jsonify({"error": "Version not found"}), 404
        
        print(f"Found recipe and version. Recipe ID: {recipe.id}, Version num: {version.version_num}", flush=True)
        print(f"Version content: title={version.content.get('title')}, content length={len(version.content.get('raw_content', ''))}", flush=True)
        
        if _is_content_identical(recipe, version):
            print("Content is identical, no restore needed", flush=True)
            return jsonify({
                "message": "No changes needed - content is identical",
                "title": recipe.title,
                "details": recipe.raw_content,
                "image": recipe.get_image_url()
            }), 200
        
        print("Starting version restoration...", flush=True)
        await _restore_version(recipe, version)
        print("Version restored successfully", flush=True)
        
        return jsonify({
            "message": "Version restored successfully",
            "title": recipe.title,
            "details": recipe.raw_content,
            "image": recipe.get_image_url()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Error restoring version: {str(e)}", flush=True)
        print(f"Error type: {type(e)}", flush=True)
        print(f"Error details: {e.__dict__}", flush=True)
        return jsonify({"error": "Failed to restore version"}), 500

# Helper functions
def _create_version(recipe, data):
    """Create new version from data"""
    recipe.cleanup_versions()
    
    new_version = RecipeVersion(
        recipe_id=recipe.id,
        content=data['content'],
        created_by=get_jwt_identity(),
        change_description=data.get('change_description')
    )
    
    # Update current version status
    current_version = RecipeVersion.query.filter_by(recipe_id=recipe.id, is_current=True).first()
    if current_version:
        current_version.is_current = False
    new_version.is_current = True
    
    db.session.add(new_version)
    db.session.commit()
    return new_version

def _get_recipe_versions(recipe):
    """Get sorted versions for recipe"""
    return RecipeVersion.query.filter_by(recipe_id=recipe.id)\
        .order_by(RecipeVersion.version_num.desc()).all()

def _is_content_identical(recipe, version):
    """Check if version content matches current recipe"""
    return (version.content['raw_content'] == recipe.raw_content and 
            version.image_data == recipe.image_data)

async def _restore_version(recipe, version):
    """Restore recipe to version state"""
    try:
        restore_description = f"שחזור לגרסה {version.version_num}"
        print(f"Restoring version {version.version_num} for recipe {recipe.id}", flush=True)
        print(f"Content to restore: title={version.content.get('title')}", flush=True)
        
        # Update Telegram message first
        telegram_success = await telegram_service.edit_message(
            recipe.telegram_id,
            version.content['raw_content'],
            version.image_data
        )
        
        if not telegram_success:
            raise Exception("Failed to update Telegram message")
            
        recipe.update_content(
            title=version.content['title'],
            raw_content=version.content['raw_content'],
            image_data=version.image_data,
            created_by=get_jwt_identity(),
            change_description=restore_description
        )
        print("Content updated successfully", flush=True)
        
    except Exception as e:
        print(f"Error in _restore_version: {str(e)}", flush=True)
        print(f"Error type: {type(e)}", flush=True)
        raise 