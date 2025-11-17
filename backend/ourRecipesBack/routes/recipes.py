from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from ..services.recipe_service import RecipeService, get_recipe_by_id
from ..services.ai_service import AIService
from ..services.auth_service import AuthService
from flask import Blueprint
import base64

recipes_bp = Blueprint("recipes", __name__)

@recipes_bp.route("/search", methods=["GET"])
@jwt_required()
def search_recipes():
    """Search recipes with advanced filters"""
    try:
        # Get and clean search parameters
        query = request.args.get("query", "").strip()
        categories = request.args.get("categories", "").split(",") if request.args.get("categories") else []
        categories = [cat.strip() for cat in categories if cat.strip()]
        
        # Get advanced filters
        prep_time = request.args.get("prepTime")
        difficulty = request.args.get("difficulty")
        include_terms = request.args.get("includeTerms", "").split(",") if request.args.get("includeTerms") else []
        exclude_terms = request.args.get("excludeTerms", "").split(",") if request.args.get("excludeTerms") else []

        print(f"""
        Search parameters:
        - Query: {query}
        - Categories: {categories}
        - Prep Time: {prep_time}
        - Difficulty: {difficulty}
        - Include Terms: {include_terms}
        - Exclude Terms: {exclude_terms}
        """, flush=True)

        # Clean lists
        include_terms = [term.strip() for term in include_terms if term.strip()]
        exclude_terms = [term.strip() for term in exclude_terms if term.strip()]

        # Perform search
        results = RecipeService.search_recipes(
            query=query,
            categories=categories,
            prep_time=prep_time,
            difficulty=difficulty,
            include_terms=include_terms,
            exclude_terms=exclude_terms
        )
        
        print(f"Found {len(results)} results", flush=True)
        return jsonify({"results": results}), 200

    except Exception as e:
        print(f"Search error in route: {str(e)}", flush=True)
        return jsonify({"error": "Search failed", "message": str(e)}), 500


@recipes_bp.route("/update/<int:telegram_id>", methods=["PUT"])
@jwt_required()
async def update_recipe(telegram_id):
    """Update existing recipe"""
    print(f"[UPDATE_RECIPE] Started update for telegram_id: {telegram_id}", flush=True)
    try:
        data = request.get_json()
        print(f"[UPDATE_RECIPE] Received data: newText length={len(data.get('newText', ''))}, has_image={bool(data.get('image'))}", flush=True)

        if not data or not data.get("newText"):
            print(f"[UPDATE_RECIPE] Missing required fields", flush=True)
            return jsonify({"error": "Missing required fields"}), 400

        print(f"[UPDATE_RECIPE] Calling RecipeService.update_recipe...", flush=True)
        recipe, error = await RecipeService.update_recipe(
            telegram_id=telegram_id,
            new_text=data["newText"],
            image_data=_process_image_data(data.get("image")),
            created_by=get_jwt_identity(),
        )

        if error:
            print(f"[UPDATE_RECIPE] RecipeService returned error: {error}", flush=True)
            return jsonify({"error": error}), 500

        print(f"[UPDATE_RECIPE] Recipe updated successfully. Recipe ID: {recipe.id if recipe else 'None'}", flush=True)

        # Update menus that contain this recipe in Telegram
        if recipe and recipe.id:
            from ..services.menu_service import MenuService
            try:
                print(f"[UPDATE_RECIPE] Updating menus that contain recipe {recipe.id}...", flush=True)
                updated_menus = await MenuService.update_menus_with_recipe(recipe.id)
                print(f"[UPDATE_RECIPE] Updated {updated_menus} menus in Telegram after recipe update", flush=True)
            except Exception as menu_error:
                # Log error but don't fail the recipe update
                print(f"[UPDATE_RECIPE] Warning: Failed to update menus in Telegram: {menu_error}", flush=True)

        print(f"[UPDATE_RECIPE] Returning success response", flush=True)
        return (
            jsonify(
                {
                    "status": "message_updated",
                    "new_message_id": recipe.telegram_id if recipe else None,
                }
            ),
            200,
        )

    except Exception as e:
        print(f"[UPDATE_RECIPE] Exception occurred: {str(e)}", flush=True)
        import traceback
        print(f"[UPDATE_RECIPE] Traceback: {traceback.format_exc()}", flush=True)
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


@recipes_bp.route("/reformat_recipe", methods=["POST"])
@jwt_required()
def reformat_recipe():
    """Reformat recipe text using AI"""
    try:
        data = request.get_json()
        if "text" not in data:
            return jsonify({"error": "Missing text"}), 400

        reformatted_text = AIService.reformat_recipe(data["text"])
        return jsonify({"reformatted_text": reformatted_text}), 200

    except Exception as e:
        print(f"Recipe reformatting error in route: {str(e)}", flush=True)
        return jsonify({"error": str(e)}), 500


@recipes_bp.route("/manage", methods=["GET"])
@jwt_required()
def get_recipes_for_management():
    """Get all recipes with management metadata"""
    try:
        
        # Get all recipes with management metadata
        recipes = RecipeService.get_recipes_for_management()
        
        return jsonify(recipes), 200

    except Exception as e:
        print(f"Management fetch error: {str(e)}", flush=True)
        return jsonify({"error": "Failed to fetch recipes"}), 500


@recipes_bp.route("/bulk", methods=["POST"])
@jwt_required()
async def bulk_action():
    """Handle bulk actions on recipes"""
    try:
        data = request.get_json()
        if not data or "action" not in data or "recipeIds" not in data:
            return jsonify({"error": "Missing required fields"}), 400
            
        action = data["action"]
        recipe_ids = data["recipeIds"]
        
        if not isinstance(recipe_ids, list):
            return jsonify({"error": "recipeIds must be a list"}), 400
            
        if action == "parse":
            result = await RecipeService.bulk_parse_recipes(recipe_ids)
            return jsonify(result), 200
        else:
            return jsonify({"error": "Invalid action"}), 400
            
    except Exception as e:
        print(f"Bulk action error: {str(e)}")
        return jsonify({"error": "Bulk action failed", "message": str(e)}), 500


@recipes_bp.route('/<int:telegram_id>', methods=['GET'])
def get_recipe(telegram_id):
    """Get recipe details by telegram_id - public endpoint for sharing"""
    try:
        recipe = RecipeService.get_recipe(telegram_id)
        if recipe is None:
            return jsonify({'error': 'Recipe not found'}), 404

        # המרת המתכון לפורמט JSON
        recipe_data = {
            'id': recipe.id,
            'telegram_id': recipe.telegram_id,
            'title': recipe.title,
            'details': recipe.raw_content,
            'image': recipe.get_image_url() if hasattr(recipe, 'get_image_url') else None,
            'created_at': recipe.created_at.isoformat() if recipe.created_at else None,
            'updated_at': recipe.updated_at.isoformat() if recipe.updated_at else None,
            'is_parsed': recipe.is_parsed,
            'parse_errors': recipe.parse_errors,
            'ingredients': recipe.ingredients,
            'instructions': recipe.instructions,
            'categories': recipe.categories,
            'preparation_time': recipe.preparation_time,
            'difficulty': recipe.difficulty.value if recipe.difficulty else None
        }

        return jsonify({'data': recipe_data}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@recipes_bp.route("/refine", methods=["POST"])
@jwt_required()
def refine_recipe():
    """Refine an existing recipe using AI based on user feedback"""
    try:
        data = request.get_json()
        if not data or not data.get("recipe_text") or not data.get("refinement_request"):
            return jsonify({"error": "Missing required fields"}), 400

        refined_recipe = AIService.refine_recipe(
            recipe_text=data["recipe_text"],
            refinement_request=data["refinement_request"]
        )
        return jsonify({"status": "success", "message": refined_recipe}), 200

    except Exception as e:
        print(f"Recipe refinement error in route: {str(e)}", flush=True)
        return jsonify({"error": "Refinement failed"}), 500


@recipes_bp.route("/optimize-steps", methods=["POST"])
@jwt_required()
def optimize_recipe_steps():
    """Analyze and optimize recipe steps using AI"""
    try:
        data = request.get_json()
        if not data or not data.get("recipe_text"):
            return jsonify({"error": "Missing recipe text"}), 400

        optimized_steps = AIService.optimize_recipe_steps(data["recipe_text"])
        return jsonify({"status": "success", "optimized_steps": optimized_steps}), 200

    except Exception as e:
        print(f"Recipe step optimization error in route: {str(e)}", flush=True)
        return jsonify({"error": "Step optimization failed"}), 500


@recipes_bp.route("/search/suggestions", methods=["GET"])
@jwt_required()
def get_search_suggestions():
    """Get search suggestions based on query"""
    try:
        query = request.args.get("q", "").strip()
        limit = request.args.get("limit", 5, type=int)
        
        suggestions = RecipeService.get_search_suggestions(query, limit)
        return jsonify({"data": suggestions}), 200
        
    except Exception as e:
        print(f"Search suggestions error: {str(e)}", flush=True)
        return jsonify({"error": "Failed to get suggestions"}), 500


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
