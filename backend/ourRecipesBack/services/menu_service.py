"""
Service for managing Menu synchronization with Telegram
Similar to RecipeService but for Menus
"""
import logging
from datetime import datetime
from sqlalchemy.sql import func
from ..extensions import db
from ..models import Menu, MenuMeal, MealRecipe, Recipe
from ..models.enums import DietaryType
from .telegram_service import telegram_service

logger = logging.getLogger(__name__)


class MenuService:
    """Service for syncing menus with Telegram"""

    @classmethod
    def format_menu_for_telegram(cls, menu):
        """
        Format menu as text for Telegram message

        Format:
        🍽️ תפריט: [שם]
        📅 אירוע: [סוג אירוע]
        👥 סועדים: [מספר]
        🔖 כשרות: [בשרי/חלבי/פרווה]
        🔗 קישור שיתוף: [share_token]

        📋 ארוחות:

        1. [שם ארוחה]
           • [מתכון 1] ([סוג מנה])
           • [מתכון 2] ([סוג מנה])

        2. [שם ארוחה 2]
           • [מתכון 3]

        🤖 הסבר AI: [ai_reasoning]

        נוצר על ידי: [user_id]
        """
        lines = ["🍽️ תפריט חדש\n"]

        # Basic info
        lines.append(f"שם: {menu.name}")
        if menu.event_type:
            lines.append(f"אירוע: {menu.event_type}")
        lines.append(f"סועדים: {menu.total_servings}")
        if menu.dietary_type:
            dietary_labels = {
                'MEAT': 'בשרי',
                'DAIRY': 'חלבי',
                'PAREVE': 'פרווה'
            }
            lines.append(f"כשרות: {dietary_labels.get(menu.dietary_type.value, menu.dietary_type.value)}")

        # IMPORTANT: Include share_token so it can be recovered after DB reset
        lines.append(f"🔗 קוד שיתוף: {menu.share_token}")

        if menu.description:
            lines.append(f"תיאור: {menu.description}")

        lines.append("\n📋 ארוחות:\n")

        # Meals and recipes
        for meal in sorted(menu.meals, key=lambda m: m.meal_order):
            lines.append(f"{meal.meal_order}. {meal.meal_type}")
            if meal.meal_time:
                lines.append(f"   ⏰ {meal.meal_time}")

            for meal_recipe in sorted(meal.recipes, key=lambda r: r.course_order):
                recipe_title = meal_recipe.recipe.title if meal_recipe.recipe else f"מתכון #{meal_recipe.recipe_id}"
                course_info = f" ({meal_recipe.course_type})" if meal_recipe.course_type else ""
                # Include recipe_id for reconstruction
                lines.append(f"   • [ID:{meal_recipe.recipe_id}] {recipe_title}{course_info}")
                if meal_recipe.ai_reason:
                    lines.append(f"     💡 {meal_recipe.ai_reason}")

            lines.append("")  # Empty line between meals

        # AI reasoning
        if menu.ai_reasoning:
            lines.append(f"\n🤖 הסבר ה-AI:\n{menu.ai_reasoning}")

        # Metadata
        lines.append(f"\n👤 נוצר על ידי: {menu.user_id}")
        lines.append(f"📅 תאריך יצירה: {menu.created_at.strftime('%d/%m/%Y %H:%M')}")

        return "\n".join(lines)

    @classmethod
    def parse_menu_from_telegram(cls, text):
        """
        Parse menu data from Telegram message text
        Returns dict with menu data, or None if parsing fails
        """
        try:
            lines = text.split("\n")
            data = {
                'meals': []
            }
            current_meal = None
            current_section = None

            for line in lines:
                line = line.strip()

                if not line:
                    continue

                # Parse basic fields
                if line.startswith("שם:"):
                    data['name'] = line.split(":", 1)[1].strip()
                elif line.startswith("אירוע:"):
                    data['event_type'] = line.split(":", 1)[1].strip()
                elif line.startswith("סועדים:"):
                    data['total_servings'] = int(line.split(":", 1)[1].strip())
                elif line.startswith("כשרות:"):
                    dietary = line.split(":", 1)[1].strip()
                    dietary_map = {
                        'בשרי': DietaryType.MEAT,
                        'חלבי': DietaryType.DAIRY,
                        'פרווה': DietaryType.PAREVE
                    }
                    data['dietary_type'] = dietary_map.get(dietary)
                elif line.startswith("🔗 קוד שיתוף:"):
                    data['share_token'] = line.split(":", 1)[1].strip()
                elif line.startswith("תיאור:"):
                    data['description'] = line.split(":", 1)[1].strip()
                elif line.startswith("👤 נוצר על ידי:"):
                    data['user_id'] = line.split(":", 1)[1].strip()
                elif line.startswith("🤖 הסבר ה-AI:"):
                    # AI reasoning can be multi-line, so we need to collect it
                    ai_reasoning_start = text.find("🤖 הסבר ה-AI:")
                    ai_reasoning_end = text.find("👤 נוצר על ידי:", ai_reasoning_start)
                    if ai_reasoning_end == -1:
                        ai_reasoning_end = len(text)
                    data['ai_reasoning'] = text[ai_reasoning_start + 14:ai_reasoning_end].strip()

                # Parse meals (starts with number)
                elif line[0].isdigit() and "." in line[:3]:
                    # Save previous meal
                    if current_meal:
                        data['meals'].append(current_meal)

                    # Start new meal
                    parts = line.split(".", 1)
                    meal_order = int(parts[0])
                    meal_type = parts[1].strip()
                    current_meal = {
                        'meal_order': meal_order,
                        'meal_type': meal_type,
                        'recipes': []
                    }
                elif line.startswith("⏰") and current_meal:
                    current_meal['meal_time'] = line.split("⏰", 1)[1].strip()
                elif line.startswith("•") and current_meal:
                    # Parse recipe
                    recipe_line = line[1:].strip()

                    # Extract recipe_id from [ID:xxx] format
                    recipe_id = None
                    if recipe_line.startswith("[ID:") and "]" in recipe_line:
                        id_end = recipe_line.find("]")
                        recipe_id_str = recipe_line[4:id_end]
                        try:
                            recipe_id = int(recipe_id_str)
                            # Remove the [ID:xxx] part from the line
                            recipe_line = recipe_line[id_end + 1:].strip()
                        except ValueError:
                            logger.warning(f"Failed to parse recipe_id from: {recipe_line}")

                    # Extract title and course type
                    if "(" in recipe_line and recipe_line.endswith(")"):
                        title_part, course_part = recipe_line.rsplit("(", 1)
                        title = title_part.strip()
                        course_type = course_part.rstrip(")").strip()
                    else:
                        title = recipe_line
                        course_type = None

                    current_meal['recipes'].append({
                        'recipe_id': recipe_id,  # Use ID if found
                        'title': title,
                        'course_type': course_type
                    })

            # Don't forget the last meal
            if current_meal:
                data['meals'].append(current_meal)

            # Name is required
            if 'name' not in data:
                return None

            return data

        except Exception as e:
            logger.error(f"Error parsing menu from Telegram: {str(e)}")
            return None

    @classmethod
    async def save_to_telegram(cls, menu):
        """
        Save menu to Telegram channel
        Returns the telegram message ID or None if failed
        """
        try:
            text = cls.format_menu_for_telegram(menu)
            message = await telegram_service.send_message(text)

            if message:
                # Update menu with telegram_message_id
                menu.telegram_message_id = message.id
                menu.last_sync = func.now()
                db.session.commit()
                logger.info(f"Menu {menu.id} saved to Telegram as message {message.id}")
                return message.id
            else:
                logger.error(f"Failed to save menu {menu.id} to Telegram")
                return None

        except Exception as e:
            logger.error(f"Error saving menu to Telegram: {str(e)}")
            return None

    @classmethod
    async def update_in_telegram(cls, menu):
        """
        Update existing menu message in Telegram
        Returns True if successful, False otherwise
        """
        try:
            if not menu.telegram_message_id:
                logger.warning(f"Menu {menu.id} has no telegram_message_id, cannot update")
                return False

            text = cls.format_menu_for_telegram(menu)
            success = await telegram_service.edit_message(menu.telegram_message_id, text)

            if success:
                menu.last_sync = func.now()
                db.session.commit()
                logger.info(f"Menu {menu.id} updated in Telegram (message {menu.telegram_message_id})")
            else:
                logger.error(f"Failed to update menu {menu.id} in Telegram")

            return success

        except Exception as e:
            logger.error(f"Error updating menu in Telegram: {str(e)}")
            return False

    @classmethod
    async def delete_from_telegram(cls, menu):
        """
        Delete menu message from Telegram
        Returns True if successful, False otherwise
        """
        try:
            if not menu.telegram_message_id:
                logger.warning(f"Menu {menu.id} has no telegram_message_id, cannot delete from Telegram")
                return True  # Consider it success if it's not in Telegram anyway

            success = await telegram_service.delete_message(menu.telegram_message_id)

            if success:
                logger.info(f"Menu {menu.id} deleted from Telegram (message {menu.telegram_message_id})")
            else:
                logger.error(f"Failed to delete menu {menu.id} from Telegram")

            return success

        except Exception as e:
            logger.error(f"Error deleting menu from Telegram: {str(e)}")
            return False

    @classmethod
    async def update_menus_with_recipe(cls, recipe_id):
        """
        Update all menus in Telegram that contain a specific recipe
        Called when a recipe is edited to keep menus in sync
        """
        try:
            # Find all menus that contain this recipe
            from ..models import MealRecipe
            meal_recipes = MealRecipe.query.filter_by(recipe_id=recipe_id).all()

            if not meal_recipes:
                logger.info(f"No menus contain recipe {recipe_id}")
                return 0

            # Get unique menu IDs
            menu_ids = set(mr.meal.menu_id for mr in meal_recipes)
            logger.info(f"Found {len(menu_ids)} menus containing recipe {recipe_id}")

            updated_count = 0
            for menu_id in menu_ids:
                menu = Menu.query.get(menu_id)
                if menu and menu.telegram_message_id:
                    success = await cls.update_in_telegram(menu)
                    if success:
                        updated_count += 1
                        logger.info(f"Updated menu {menu_id} in Telegram after recipe {recipe_id} change")
                    else:
                        logger.warning(f"Failed to update menu {menu_id} in Telegram")

            return updated_count

        except Exception as e:
            logger.error(f"Error updating menus with recipe {recipe_id}: {str(e)}")
            return 0

    @classmethod
    async def sync_message(cls, client, message, sync_log):
        """
        Sync single Telegram menu message to database
        Similar to RecipeService.sync_message but for menus
        """
        try:
            if not message or not message.text:
                sync_log.menus_failed += 1
                return

            # Check if this is a menu message (contains "🍽️ תפריט")
            if "🍽️ תפריט" not in message.text:
                return  # Not a menu message

            # Parse menu data
            menu_data = cls.parse_menu_from_telegram(message.text)
            if not menu_data:
                logger.error(f"Failed to parse menu from message {message.id}")
                sync_log.menus_failed += 1
                return

            # Check if menu already exists
            existing_menu = Menu.query.filter_by(telegram_message_id=message.id).first()

            if existing_menu:
                # Update existing menu
                existing_menu.name = menu_data.get('name', existing_menu.name)
                existing_menu.event_type = menu_data.get('event_type')
                existing_menu.description = menu_data.get('description')
                existing_menu.total_servings = menu_data.get('total_servings', existing_menu.total_servings)
                existing_menu.dietary_type = menu_data.get('dietary_type')
                existing_menu.ai_reasoning = menu_data.get('ai_reasoning')

                # Update share_token if found in message
                if 'share_token' in menu_data:
                    existing_menu.share_token = menu_data['share_token']

                existing_menu.last_sync = func.now()
                sync_log.menus_updated += 1
                logger.info(f"Menu {existing_menu.id} updated from Telegram message {message.id}")
            else:
                # Create new menu
                new_menu = Menu(
                    user_id=menu_data.get('user_id', 'telegram_sync'),
                    name=menu_data['name'],
                    telegram_message_id=message.id,
                    last_sync=func.now()
                )

                # Set optional fields
                if 'event_type' in menu_data:
                    new_menu.event_type = menu_data['event_type']
                if 'description' in menu_data:
                    new_menu.description = menu_data['description']
                if 'total_servings' in menu_data:
                    new_menu.total_servings = menu_data['total_servings']
                if 'dietary_type' in menu_data:
                    new_menu.dietary_type = menu_data['dietary_type']
                if 'ai_reasoning' in menu_data:
                    new_menu.ai_reasoning = menu_data['ai_reasoning']
                if 'share_token' in menu_data:
                    new_menu.share_token = menu_data['share_token']

                db.session.add(new_menu)
                db.session.flush()  # Get the menu ID

                # Create meals and recipes
                for meal_data in menu_data.get('meals', []):
                    meal = MenuMeal(
                        menu_id=new_menu.id,
                        meal_type=meal_data['meal_type'],
                        meal_order=meal_data['meal_order'],
                        meal_time=meal_data.get('meal_time')
                    )
                    db.session.add(meal)
                    db.session.flush()  # Get the meal ID

                    # Add recipes to meal
                    for idx, recipe_data in enumerate(meal_data.get('recipes', [])):
                        # First try to find recipe by ID if available
                        recipe = None
                        if recipe_data.get('recipe_id'):
                            recipe = Recipe.query.get(recipe_data['recipe_id'])
                            if not recipe:
                                logger.warning(f"Recipe with ID {recipe_data['recipe_id']} not found, trying by title")

                        # Fallback to finding by title if ID not available or recipe not found
                        if not recipe and recipe_data.get('title'):
                            recipe = Recipe.query.filter_by(title=recipe_data['title']).first()

                        if recipe:
                            meal_recipe = MealRecipe(
                                menu_meal_id=meal.id,
                                recipe_id=recipe.id,
                                course_type=recipe_data.get('course_type'),
                                course_order=idx
                            )
                            db.session.add(meal_recipe)
                        else:
                            logger.warning(f"Recipe not found: ID={recipe_data.get('recipe_id')}, title={recipe_data.get('title')}")

                sync_log.menus_added += 1
                logger.info(f"Menu {new_menu.id} created from Telegram message {message.id}")

            sync_log.menus_processed += 1

        except Exception as e:
            sync_log.menus_failed += 1
            logger.error(f"Error syncing menu message {message.id}: {str(e)}")
            raise
