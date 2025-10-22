from flask import jsonify, request, Blueprint
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..services.menu_planner_service import MenuPlannerService
from ..services.shopping_list_service import ShoppingListService
from ..services.menu_service import MenuService
from ..models import Menu, MenuMeal, MealRecipe
from ..extensions import db
import asyncio

menus_bp = Blueprint("menus", __name__)


@menus_bp.route("/generate", methods=["POST"])
@jwt_required()
def generate_menu():
    """
    Generate a new menu using AI

    Request body:
    {
        "name": "תפריט שבת",
        "event_type": "שבת",
        "servings": 8,
        "dietary_type": "meat",
        "meal_types": ["ארוחת ערב שבת", "בוקר", "סעודה שלישית"],
        "special_requests": "ללא אורז"
    }
    """
    try:
        user_id = get_jwt_identity()
        data = request.get_json()

        print(f"🍽️ Menu generation request from user {user_id}")
        print(f"   Request: {data.get('name')} - {data.get('meal_types')}")

        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Validate required fields
        if not data.get('name'):
            return jsonify({"error": "Menu name is required"}), 400

        if not data.get('meal_types') or len(data['meal_types']) == 0:
            return jsonify({"error": "At least one meal type is required"}), 400

        # Pre-check: Verify we have recipes in the database
        from ..models import Recipe, RecipeStatus
        available_recipes = Recipe.query.filter(
            Recipe.status == RecipeStatus.ACTIVE.value,
            Recipe.is_parsed == True
        ).count()

        print(f"📚 Available recipes in DB: {available_recipes}")

        if available_recipes < 5:
            return jsonify({
                "error": "Not enough recipes",
                "message": f"Only {available_recipes} recipes available in database. Need at least 5 recipes to generate a menu."
            }), 400

        # Generate menu (this may take 30-60 seconds)
        print(f"🤖 Starting AI menu generation...")
        menu = MenuPlannerService.generate_menu(user_id, data)
        print(f"✓ Menu generated: ID {menu.id}")

        # Generate shopping list
        print(f"🛒 Generating shopping list...")
        shopping_list = ShoppingListService.generate_shopping_list(menu.id)
        print(f"✓ Shopping list generated: {len(shopping_list)} categories")

        # Save menu to Telegram
        print(f"📤 Saving menu to Telegram...")
        try:
            telegram_message_id = asyncio.run(MenuService.save_to_telegram(menu))
            if telegram_message_id:
                print(f"✓ Menu saved to Telegram (message ID: {telegram_message_id})")
            else:
                print(f"⚠️ Failed to save menu to Telegram (but menu created in DB)")
        except Exception as telegram_error:
            print(f"⚠️ Error saving to Telegram: {telegram_error}")
            # Continue anyway - menu is already in DB

        print(f"✓ Complete! Returning menu to client")
        return jsonify({
            "success": True,
            "menu": menu.to_dict(),
            "shopping_list": shopping_list
        }), 201

    except Exception as e:
        print(f"❌ Error generating menu: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Failed to generate menu", "message": str(e)}), 500


@menus_bp.route("", methods=["GET"])
@jwt_required()
def get_user_menus():
    """Get all menus for the current user"""
    try:
        user_id = get_jwt_identity()

        menus = Menu.query.filter_by(user_id=user_id).order_by(Menu.created_at.desc()).all()

        return jsonify({
            "menus": [menu.to_dict(include_meals=False) for menu in menus]
        }), 200

    except Exception as e:
        print(f"Error fetching menus: {str(e)}")
        return jsonify({"error": "Failed to fetch menus", "message": str(e)}), 500


@menus_bp.route("/<int:menu_id>", methods=["GET"])
@jwt_required()
def get_menu(menu_id):
    """Get a specific menu with all details"""
    try:
        user_id = get_jwt_identity()

        menu = Menu.query.get(menu_id)

        if not menu:
            return jsonify({"error": "Menu not found"}), 404

        # Check ownership or public access
        if menu.user_id != user_id and not menu.is_public:
            return jsonify({"error": "Access denied"}), 403

        return jsonify({
            "menu": menu.to_dict()
        }), 200

    except Exception as e:
        print(f"Error fetching menu: {str(e)}")
        return jsonify({"error": "Failed to fetch menu", "message": str(e)}), 500


@menus_bp.route("/shared/<string:share_token>", methods=["GET"])
def get_shared_menu(share_token):
    """Get a menu by share token (no auth required)"""
    try:
        menu = Menu.query.filter_by(share_token=share_token, is_public=True).first()

        if not menu:
            return jsonify({"error": "Menu not found or not shared"}), 404

        return jsonify({
            "menu": menu.to_dict()
        }), 200

    except Exception as e:
        print(f"Error fetching shared menu: {str(e)}")
        return jsonify({"error": "Failed to fetch menu", "message": str(e)}), 500


@menus_bp.route("/<int:menu_id>", methods=["PUT"])
@jwt_required()
def update_menu(menu_id):
    """
    Update menu details

    Request body:
    {
        "name": "תפריט שבת מעודכן",
        "description": "תיאור",
        "is_public": true
    }
    """
    try:
        user_id = get_jwt_identity()
        data = request.get_json()

        menu = Menu.query.get(menu_id)

        if not menu:
            return jsonify({"error": "Menu not found"}), 404

        if menu.user_id != user_id:
            return jsonify({"error": "Access denied"}), 403

        # Update fields
        if 'name' in data:
            menu.name = data['name']
        if 'description' in data:
            menu.description = data['description']
        if 'is_public' in data:
            menu.is_public = data['is_public']

        db.session.commit()

        # Update in Telegram if menu is synced
        if menu.telegram_message_id:
            print(f"📝 Updating menu in Telegram...")
            try:
                success = asyncio.run(MenuService.update_in_telegram(menu))
                if success:
                    print(f"✓ Menu updated in Telegram")
                else:
                    print(f"⚠️ Failed to update menu in Telegram (but updated in DB)")
            except Exception as telegram_error:
                print(f"⚠️ Error updating in Telegram: {telegram_error}")
                # Continue anyway - menu is already updated in DB

        return jsonify({
            "success": True,
            "menu": menu.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error updating menu: {str(e)}")
        return jsonify({"error": "Failed to update menu", "message": str(e)}), 500


@menus_bp.route("/<int:menu_id>", methods=["DELETE"])
@jwt_required()
def delete_menu(menu_id):
    """Delete a menu"""
    try:
        user_id = get_jwt_identity()

        menu = Menu.query.get(menu_id)

        if not menu:
            return jsonify({"error": "Menu not found"}), 404

        if menu.user_id != user_id:
            return jsonify({"error": "Access denied"}), 403

        # Delete from Telegram first
        if menu.telegram_message_id:
            print(f"🗑️ Deleting menu from Telegram...")
            try:
                success = asyncio.run(MenuService.delete_from_telegram(menu))
                if success:
                    print(f"✓ Menu deleted from Telegram")
                else:
                    print(f"⚠️ Failed to delete menu from Telegram (continuing with DB deletion)")
            except Exception as telegram_error:
                print(f"⚠️ Error deleting from Telegram: {telegram_error}")
                # Continue anyway - will delete from DB

        # Delete from DB
        db.session.delete(menu)
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Menu deleted successfully"
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error deleting menu: {str(e)}")
        return jsonify({"error": "Failed to delete menu", "message": str(e)}), 500


@menus_bp.route("/<int:menu_id>/meals/<int:meal_id>/recipes/<int:recipe_id>", methods=["PUT"])
@jwt_required()
def replace_recipe(menu_id, meal_id, recipe_id):
    """
    Replace a recipe in a meal

    Request body:
    {
        "new_recipe_id": 789
    }
    """
    try:
        user_id = get_jwt_identity()
        data = request.get_json()

        # Verify ownership
        menu = Menu.query.get(menu_id)
        if not menu or menu.user_id != user_id:
            return jsonify({"error": "Access denied"}), 403

        # Find the meal recipe
        meal_recipe = MealRecipe.query.filter_by(
            menu_meal_id=meal_id,
            recipe_id=recipe_id
        ).first()

        if not meal_recipe:
            return jsonify({"error": "Recipe not found in meal"}), 404

        # Update recipe
        new_recipe_id = data.get('new_recipe_id')
        if not new_recipe_id:
            return jsonify({"error": "new_recipe_id is required"}), 400

        meal_recipe.recipe_id = new_recipe_id

        db.session.commit()

        # Regenerate shopping list
        shopping_list = ShoppingListService.generate_shopping_list(menu_id)

        return jsonify({
            "success": True,
            "meal_recipe": meal_recipe.to_dict(),
            "shopping_list": shopping_list
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error replacing recipe: {str(e)}")
        return jsonify({"error": "Failed to replace recipe", "message": str(e)}), 500


@menus_bp.route("/<int:menu_id>/meals/<int:meal_id>/recipes/<int:recipe_id>/suggestions", methods=["GET"])
@jwt_required()
def get_recipe_suggestions(menu_id, meal_id, recipe_id):
    """Get alternative recipe suggestions for replacement"""
    try:
        user_id = get_jwt_identity()

        # Verify ownership
        menu = Menu.query.get(menu_id)
        if not menu or menu.user_id != user_id:
            return jsonify({"error": "Access denied"}), 403

        # Find the meal recipe
        meal_recipe = MealRecipe.query.filter_by(
            menu_meal_id=meal_id,
            recipe_id=recipe_id
        ).first()

        if not meal_recipe:
            return jsonify({"error": "Recipe not found in meal"}), 404

        # Get suggestions
        suggestions = MenuPlannerService.suggest_recipe_replacement(
            meal_id,
            recipe_id,
            meal_recipe.course_type
        )

        return jsonify({
            "suggestions": suggestions
        }), 200

    except Exception as e:
        print(f"Error getting suggestions: {str(e)}")
        return jsonify({"error": "Failed to get suggestions", "message": str(e)}), 500


@menus_bp.route("/<int:menu_id>/shopping-list", methods=["GET"])
@jwt_required()
def get_shopping_list(menu_id):
    """Get shopping list for a menu"""
    try:
        user_id = get_jwt_identity()

        # Verify ownership
        menu = Menu.query.get(menu_id)
        if not menu or menu.user_id != user_id:
            return jsonify({"error": "Access denied"}), 403

        shopping_list = ShoppingListService.get_shopping_list(menu_id)

        return jsonify({
            "shopping_list": shopping_list
        }), 200

    except Exception as e:
        print(f"Error getting shopping list: {str(e)}")
        return jsonify({"error": "Failed to get shopping list", "message": str(e)}), 500


@menus_bp.route("/<int:menu_id>/shopping-list/regenerate", methods=["POST"])
@jwt_required()
def regenerate_shopping_list(menu_id):
    """Regenerate shopping list for a menu"""
    try:
        user_id = get_jwt_identity()

        # Verify ownership
        menu = Menu.query.get(menu_id)
        if not menu or menu.user_id != user_id:
            return jsonify({"error": "Access denied"}), 403

        shopping_list = ShoppingListService.generate_shopping_list(menu_id)

        return jsonify({
            "success": True,
            "shopping_list": shopping_list
        }), 200

    except Exception as e:
        print(f"Error regenerating shopping list: {str(e)}")
        return jsonify({"error": "Failed to regenerate shopping list", "message": str(e)}), 500


@menus_bp.route("/shopping-list/items/<int:item_id>", methods=["PATCH"])
@jwt_required()
def update_shopping_item(item_id):
    """
    Update shopping list item status

    Request body:
    {
        "is_checked": true
    }
    """
    try:
        data = request.get_json()

        if 'is_checked' not in data:
            return jsonify({"error": "is_checked is required"}), 400

        item = ShoppingListService.update_item_status(item_id, data['is_checked'])

        return jsonify({
            "success": True,
            "item": item.to_dict()
        }), 200

    except Exception as e:
        print(f"Error updating shopping item: {str(e)}")
        return jsonify({"error": "Failed to update item", "message": str(e)}), 500
