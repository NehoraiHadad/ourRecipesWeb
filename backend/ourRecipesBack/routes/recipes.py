from flask import jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..services.recipe_service import RecipeService
from ..services.ai_service import AIService
from flask import Blueprint
import base64

recipes_bp = Blueprint("recipes", __name__)


@recipes_bp.route("/search", methods=["GET"])
@jwt_required()
def search_recipes():
    """Search recipes by text and categories"""
    try:
        # Get and clean search parameters
        query = request.args.get("query", "").strip()
        categories = (
            request.args.get("categories", "").split(",")
            if request.args.get("categories")
            else []
        )
        categories = [cat.strip() for cat in categories if cat.strip()]

        # Perform search
        results = RecipeService.search_recipes(query, categories)
        return jsonify({"results": results}), 200

    except Exception as e:
        print(f"Search error in route: {str(e)}", flush=True)
        return jsonify({"error": "Search failed", "message": str(e)}), 500


@recipes_bp.route("/update/<int:telegram_id>", methods=["PUT"])
@jwt_required()
async def update_recipe(telegram_id):
    """Update existing recipe"""
    try:
        data = request.get_json()
        
        if not data or not data.get("newText"):
            return jsonify({"error": "Missing required fields"}), 400
        
        recipe, error = await RecipeService.update_recipe(
            telegram_id=telegram_id,
            new_text=data["newText"],
            image_data=_process_image_data(data.get("image")),
            created_by=get_jwt_identity(),
        )

        if error:
            return jsonify({"error": error}), 500

        return jsonify({
            "status": "message_updated",
            "new_message_id": recipe.telegram_id if recipe else None
        }), 200

    except Exception as e:
        print(f"Update error: {str(e)}", flush=True)
        return jsonify({"error": "Update failed"}), 500


@recipes_bp.route("/create", methods=["POST"])
@jwt_required()
async def create_recipe():
    """Create new recipe"""
    try:
        data = request.get_json()
        if not data or not data.get("newText"):
            return jsonify({"error": "No text provided"}), 400

        recipe, message_id = await RecipeService.create_recipe(
            text=data["newText"],
            image_data=_process_image_data(data.get("image")),
            created_by=get_jwt_identity(),
        )

        if not message_id:
            return jsonify({"error": "Failed to create recipe"}), 500

        return jsonify({"status": "message_sent", "message_id": message_id}), 200

    except Exception as e:
        print(f"Creation error: {str(e)}", flush=True)
        return jsonify({"error": "Creation failed"}), 500


@recipes_bp.route("/suggest", methods=["POST"])
@jwt_required()
def generate_recipe_suggestion():
    """Generate recipe suggestions using AI"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        response = AIService.generate_recipe_suggestion(
            ingredients=data.get("ingredients", ""),
            meal_type=data.get("mealType", []),
            quick_prep=data.get("quickPrep", False),
            child_friendly=data.get("childFriendly", False),
            additional_requests=data.get("additionalRequests", ""),
        )
        return jsonify({"status": "success", "message": response}), 200

    except Exception as e:
        print(f"AI generation error: {str(e)}", flush=True)
        return jsonify({"error": "Generation failed"}), 500


@recipes_bp.route("/generate-image", methods=["POST"])
@jwt_required()
async def generate_recipe_image():
    """Generate AI image for recipe"""
    try:
        data = request.get_json()
        if not data or not data.get("recipeContent"):
            return jsonify({"error": "No recipe content provided"}), 400

        image_base64 = await AIService.generate_recipe_image(data["recipeContent"])
        return jsonify({"image": f"data:image/jpeg;base64,{image_base64}"}), 200

    except Exception as e:
        print(f"Image generation error in route: {str(e)}", flush=True)
        return jsonify({"error": "Image generation failed"}), 500


# Helper functions
def _process_image_data(image_data):
    """Process and validate image data"""
    if not image_data:
        return None

    if not isinstance(image_data, str) or not image_data.startswith("data:image"):
        return None

    try:
        image_format, image_string = image_data.split(";base64,")
        return base64.b64decode(image_string)
    except Exception as e:
        print(f"Image processing error: {str(e)}", flush=True)
        return None
