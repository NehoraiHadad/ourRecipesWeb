import google.generativeai as genai
from flask import current_app
import json
from sqlalchemy import and_, or_
from ..extensions import db
from ..models import Recipe, Menu, MenuMeal, MealRecipe
from ..models.enums import DietaryType, RecipeStatus


class MenuPlannerService:
    """Service for AI-powered menu planning"""

    @staticmethod
    def _get_menu_planner_prompt():
        """Get base prompt for menu planning"""
        return """
        You are an expert chef and meal planner specializing in kosher cuisine.
        Your role is to create balanced, logical, and delicious menu plans for various events.

        IMPORTANT RULES:
        1. KOSHER LAWS: Never mix meat (בשרי) and dairy (חלבי) in the same meal
        2. BALANCE: Create variety in flavors, textures, and cooking methods
        3. TIMING: Consider preparation times - don't overload with complex dishes
        4. APPROPRIATENESS: Match dishes to the event type (Shabbat = more festive)
        5. SEASONS: Prefer seasonal ingredients when possible
        6. PRACTICALITY: Choose realistic combinations that work well together

        You will receive a list of available recipes (with metadata only) and user preferences.
        Your task is to select recipes from this list and compose a complete menu.

        Always respond in valid JSON format with your menu plan and reasoning.
        """

    @classmethod
    def _get_relevant_recipes(cls, dietary_type=None, max_recipes=100):
        """
        Query database for relevant recipes with minimal data

        Args:
            dietary_type: Filter by dietary type (meat/dairy/pareve)
            max_recipes: Maximum number of recipes to return

        Returns:
            list: Recipe summaries with essential metadata
        """
        query = Recipe.query.filter(
            Recipe.status == RecipeStatus.ACTIVE.value,
            Recipe.is_parsed == True,
            Recipe.title.isnot(None)
        )

        # Filter by dietary type if specified
        if dietary_type:
            # This assumes recipes have dietary info in categories or metadata
            # Adjust based on actual data structure
            if dietary_type == DietaryType.MEAT:
                query = query.filter(
                    or_(
                        Recipe._categories.contains('בשר'),
                        Recipe._categories.contains('עוף'),
                        Recipe._categories.contains('דגים')
                    )
                )
            elif dietary_type == DietaryType.DAIRY:
                query = query.filter(
                    or_(
                        Recipe._categories.contains('חלבי'),
                        Recipe._categories.contains('גבינה'),
                        Recipe._categories.contains('חלב')
                    )
                )
            elif dietary_type == DietaryType.PAREVE:
                query = query.filter(
                    and_(
                        ~Recipe._categories.contains('בשר'),
                        ~Recipe._categories.contains('עוף'),
                        ~Recipe._categories.contains('חלבי'),
                        ~Recipe._categories.contains('חלב')
                    )
                )

        # Prioritize recipes with complete information
        query = query.order_by(
            Recipe.cooking_time.isnot(None).desc(),
            Recipe.difficulty.isnot(None).desc(),
            Recipe.updated_at.desc()
        ).limit(max_recipes)

        recipes = query.all()

        # Return only essential metadata (not full content!)
        return [
            {
                'id': recipe.id,
                'title': recipe.title,
                'categories': recipe._categories or '',
                'difficulty': recipe.difficulty.value if recipe.difficulty else 'medium',
                'cooking_time': recipe.cooking_time or 30,
                'preparation_time': recipe.preparation_time or 15,
                'servings': recipe.servings or 4,
                'has_image': bool(recipe.image_url or recipe.image_data)
            }
            for recipe in recipes
        ]

    @classmethod
    def _categorize_recipes(cls, recipes):
        """
        Categorize recipes by likely course type

        Args:
            recipes: List of recipe summaries

        Returns:
            dict: Recipes organized by course type
        """
        categories = {
            'appetizers': [],  # מנות ראשונות
            'salads': [],      # סלטים
            'soups': [],       # מרקים
            'mains': [],       # מנות עיקריות
            'sides': [],       # תוספות
            'desserts': []     # קינוחים
        }

        for recipe in recipes:
            cats = recipe['categories'].lower()

            # Categorize based on keywords
            if any(word in cats for word in ['סלט', 'ירקות טריים']):
                categories['salads'].append(recipe)
            elif any(word in cats for word in ['מרק', 'soup']):
                categories['soups'].append(recipe)
            elif any(word in cats for word in ['עוגה', 'קינוח', 'עוגיות', 'מתוק', 'dessert', 'cake']):
                categories['desserts'].append(recipe)
            elif any(word in cats for word in ['תוספת', 'אורז', 'פסטה', 'תפוחי אדמה', 'side']):
                categories['sides'].append(recipe)
            elif any(word in cats for word in ['בשר', 'עוף', 'דג', 'main', 'עיקרי']):
                categories['mains'].append(recipe)
            else:
                # Default to mains or appetizers based on cooking time
                if recipe['cooking_time'] > 45:
                    categories['mains'].append(recipe)
                else:
                    categories['appetizers'].append(recipe)

        return categories

    @classmethod
    def _build_planning_prompt(cls, recipes_by_category, event_type, servings,
                               dietary_type, meal_types, special_requests):
        """
        Build the AI prompt for menu planning

        Args:
            recipes_by_category: Recipes organized by course type
            event_type: Type of event (e.g., "שבת")
            servings: Number of servings needed
            dietary_type: Dietary restrictions
            meal_types: List of meal types (e.g., ["ערב שבת", "בוקר"])
            special_requests: Additional user requests

        Returns:
            str: Formatted prompt for AI
        """
        dietary_name = DietaryType.get_display_name(dietary_type.value) if dietary_type else 'כללי'

        prompt = f"""
נתוני האירוע:
- סוג אירוע: {event_type}
- מספר סועדים: {servings}
- סוג כשרות: {dietary_name}
- ארוחות לתכנון: {', '.join(meal_types)}
{f'- דרישות מיוחדות: {special_requests}' if special_requests else ''}

מתכונים זמינים לפי קטגוריות:

"""

        # Add recipes by category
        for category, recipes in recipes_by_category.items():
            if recipes:
                hebrew_names = {
                    'salads': 'סלטים',
                    'soups': 'מרקים',
                    'appetizers': 'מנות ראשונות',
                    'mains': 'מנות עיקריות',
                    'sides': 'תוספות',
                    'desserts': 'קינוחים'
                }
                prompt += f"\n{hebrew_names.get(category, category)}:\n"
                for recipe in recipes[:15]:  # Limit to 15 per category
                    prompt += f"  - ID: {recipe['id']}, שם: {recipe['title']}, "
                    prompt += f"זמן: {recipe['cooking_time']}דק, קושי: {recipe['difficulty']}\n"

        prompt += """

המשימה שלך:
1. בחר מתכונים מהרשימה לעיל (השתמש רק ב-ID המדויק!)
2. צור תפריט מאוזן ומגוון לכל ארוחה
3. וודא עמידה בכללי כשרות (לא לערבב בשרי וחלבי!)
4. הקפד על מגוון טעמים, טקסטורות וזמני הכנה

החזר JSON בפורמט הבא (בלבד!):
{
  "meals": [
    {
      "meal_type": "ארוחת ערב שבת",
      "meal_order": 1,
      "recipes": [
        {
          "recipe_id": 123,
          "course_type": "salad",
          "course_order": 1,
          "reason": "סלט קל ורענן לפתיחת הארוחה"
        },
        {
          "recipe_id": 456,
          "course_type": "main",
          "course_order": 2,
          "reason": "מנה עיקרית חגיגית"
        }
      ]
    }
  ],
  "reasoning": "הסבר כללי למה התפריט הזה מאוזן והגיוני"
}

שים לב: השתמש רק במזהי מתכונים (recipe_id) שמופיעים ברשימה שקיבלת!
"""

        return prompt

    @classmethod
    def generate_menu(cls, user_id, preferences):
        """
        Generate a complete menu based on user preferences

        Args:
            user_id: ID of the user creating the menu
            preferences: Dictionary with:
                - name: Menu name
                - event_type: Type of event
                - servings: Number of servings
                - dietary_type: Dietary restrictions (meat/dairy/pareve)
                - meal_types: List of meals to plan
                - special_requests: Additional requests

        Returns:
            Menu: Created menu object
        """
        try:
            # Extract preferences
            event_type = preferences.get('event_type', 'אירוע')
            servings = preferences.get('servings', 4)
            dietary_type_str = preferences.get('dietary_type')
            dietary_type = DietaryType[dietary_type_str.upper()] if dietary_type_str else None
            meal_types = preferences.get('meal_types', [])
            special_requests = preferences.get('special_requests', '')

            # Get relevant recipes from DB (pre-filtered)
            recipes = cls._get_relevant_recipes(dietary_type=dietary_type, max_recipes=100)

            if not recipes:
                raise Exception("No recipes found in database")

            # Categorize recipes
            recipes_by_category = cls._categorize_recipes(recipes)

            # Build prompt for AI
            prompt = cls._build_planning_prompt(
                recipes_by_category=recipes_by_category,
                event_type=event_type,
                servings=servings,
                dietary_type=dietary_type,
                meal_types=meal_types,
                special_requests=special_requests
            )

            # Call AI to generate menu plan
            genai.configure(api_key=current_app.config["GOOGLE_API_KEY"])
            model = genai.GenerativeModel(
                model_name="gemini-1.5-flash",
                system_instruction=cls._get_menu_planner_prompt(),
                generation_config={"response_mime_type": "application/json"}
            )

            response = model.generate_content(prompt)
            menu_plan = json.loads(response.text)

            # Create menu in database
            menu = cls._create_menu_from_plan(
                user_id=user_id,
                preferences=preferences,
                menu_plan=menu_plan
            )

            return menu

        except Exception as e:
            print(f"Menu generation error: {str(e)}")
            raise

    @classmethod
    def _create_menu_from_plan(cls, user_id, preferences, menu_plan):
        """
        Create menu database records from AI plan

        Args:
            user_id: User ID
            preferences: Original preferences
            menu_plan: AI-generated plan (JSON)

        Returns:
            Menu: Created menu object
        """
        try:
            # Create main menu
            dietary_type_str = preferences.get('dietary_type')
            dietary_type = DietaryType[dietary_type_str.upper()] if dietary_type_str else None

            menu = Menu(
                user_id=user_id,
                name=preferences.get('name', 'תפריט חדש'),
                event_type=preferences.get('event_type'),
                description=preferences.get('description'),
                total_servings=preferences.get('servings', 4),
                dietary_type=dietary_type,
                ai_reasoning=menu_plan.get('reasoning'),
                generation_prompt=json.dumps(preferences, ensure_ascii=False)
            )

            db.session.add(menu)
            db.session.flush()  # Get menu ID

            # Create meals and recipes
            for meal_data in menu_plan.get('meals', []):
                meal = MenuMeal(
                    menu_id=menu.id,
                    meal_type=meal_data.get('meal_type'),
                    meal_order=meal_data.get('meal_order'),
                    meal_time=meal_data.get('meal_time')
                )

                db.session.add(meal)
                db.session.flush()  # Get meal ID

                # Add recipes to meal
                for recipe_data in meal_data.get('recipes', []):
                    meal_recipe = MealRecipe(
                        menu_meal_id=meal.id,
                        recipe_id=recipe_data.get('recipe_id'),
                        course_type=recipe_data.get('course_type'),
                        course_order=recipe_data.get('course_order', 0),
                        servings=preferences.get('servings'),
                        ai_reason=recipe_data.get('reason')
                    )

                    db.session.add(meal_recipe)

            db.session.commit()

            # Reload menu with all relationships
            menu = Menu.query.get(menu.id)
            return menu

        except Exception as e:
            db.session.rollback()
            print(f"Error creating menu from plan: {str(e)}")
            raise

    @classmethod
    def suggest_recipe_replacement(cls, menu_meal_id, current_recipe_id, course_type):
        """
        Suggest alternative recipes for a specific slot in a meal

        Args:
            menu_meal_id: ID of the menu meal
            current_recipe_id: Current recipe to replace
            course_type: Type of course (to find similar)

        Returns:
            list: Suggested alternative recipes
        """
        try:
            # Get the meal and menu context
            meal = MenuMeal.query.get(menu_meal_id)
            if not meal:
                return []

            menu = meal.menu

            # Get similar recipes based on course type and dietary restrictions
            query = Recipe.query.filter(
                Recipe.status == RecipeStatus.ACTIVE.value,
                Recipe.is_parsed == True,
                Recipe.id != current_recipe_id
            )

            # Filter by dietary type if menu has restrictions
            if menu.dietary_type:
                if menu.dietary_type == DietaryType.MEAT:
                    query = query.filter(
                        or_(
                            Recipe._categories.contains('בשר'),
                            Recipe._categories.contains('עוף'),
                            Recipe._categories.contains('דגים')
                        )
                    )
                elif menu.dietary_type == DietaryType.DAIRY:
                    query = query.filter(
                        or_(
                            Recipe._categories.contains('חלבי'),
                            Recipe._categories.contains('גבינה')
                        )
                    )

            # Filter by course type based on keywords
            course_keywords = {
                'salad': ['סלט', 'ירקות'],
                'soup': ['מרק'],
                'appetizer': ['מנה ראשונה', 'פתיח'],
                'main': ['בשר', 'עוף', 'דג', 'עיקרי'],
                'side': ['תוספת', 'אורז', 'פסטה'],
                'dessert': ['קינוח', 'עוגה', 'מתוק']
            }

            keywords = course_keywords.get(course_type, [])
            if keywords:
                conditions = [Recipe._categories.contains(kw) for kw in keywords]
                query = query.filter(or_(*conditions))

            # Get top suggestions
            suggestions = query.limit(10).all()

            return [
                {
                    'id': recipe.id,
                    'title': recipe.title,
                    'categories': recipe._categories,
                    'difficulty': recipe.difficulty.value if recipe.difficulty else None,
                    'cooking_time': recipe.cooking_time,
                    'preparation_time': recipe.preparation_time,
                    'image_url': recipe.image_url
                }
                for recipe in suggestions
            ]

        except Exception as e:
            print(f"Error suggesting replacements: {str(e)}")
            return []
