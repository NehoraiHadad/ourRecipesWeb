import google.generativeai as genai
from flask import current_app
import json
from sqlalchemy import and_, or_
from ..extensions import db
from ..models import Recipe, Menu, MenuMeal, MealRecipe
from ..models.enums import DietaryType, RecipeStatus


class MenuPlannerService:
    """Service for AI-powered menu planning with Function Calling"""

    @staticmethod
    def _get_search_tools():
        """
        Define tools that AI can use to search for recipes.
        This enables dynamic, intelligent recipe discovery.
        """
        return [
            {
                "function_declarations": [
                    {
                        "name": "search_recipes",
                        "description": "Search for recipes in the database with various filters. Use this to find recipes that match specific criteria for menu planning.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "dietary_type": {
                                    "type": "string",
                                    "enum": ["meat", "dairy", "pareve"],
                                    "description": "Kosher dietary type: meat (בשרי), dairy (חלבי), or pareve (פרווה)"
                                },
                                "course_type": {
                                    "type": "string",
                                    "enum": ["appetizer", "salad", "soup", "main", "side", "dessert"],
                                    "description": "Type of course in the meal"
                                },
                                "max_cooking_time": {
                                    "type": "integer",
                                    "description": "Maximum cooking time in minutes"
                                },
                                "difficulty": {
                                    "type": "string",
                                    "enum": ["easy", "medium", "hard"],
                                    "description": "Recipe difficulty level"
                                },
                                "limit": {
                                    "type": "integer",
                                    "description": "Maximum number of recipes to return (use 10 if not specified)"
                                },
                                "exclude_ids": {
                                    "type": "array",
                                    "items": {"type": "integer"},
                                    "description": "Recipe IDs to exclude from results (useful for avoiding duplicates)"
                                }
                            }
                        }
                    },
                    {
                        "name": "get_recipe_details",
                        "description": "Get full details of a specific recipe by ID. Use this when you need more information about a recipe.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "recipe_id": {
                                    "type": "integer",
                                    "description": "The ID of the recipe to get details for"
                                }
                            },
                            "required": ["recipe_id"]
                        }
                    }
                ]
            }
        ]

    @classmethod
    def _execute_search_recipes(cls, dietary_type=None, course_type=None,
                                max_cooking_time=None, difficulty=None,
                                limit=10, exclude_ids=None):
        """
        Execute a recipe search based on AI's request.

        Args:
            dietary_type: Dietary restriction (meat/dairy/pareve)
            course_type: Type of course (appetizer/main/etc)
            max_cooking_time: Maximum cooking time in minutes
            difficulty: Recipe difficulty
            limit: Maximum results to return
            exclude_ids: Recipe IDs to exclude

        Returns:
            list: Matching recipes with metadata
        """
        query = Recipe.query.filter(
            Recipe.status == RecipeStatus.ACTIVE.value,
            Recipe.is_parsed == True,
            Recipe.title.isnot(None)
        )

        # Apply dietary type filter
        if dietary_type:
            if dietary_type == 'meat':
                query = query.filter(
                    or_(
                        Recipe._categories.contains('בשר'),
                        Recipe._categories.contains('עוף'),
                        Recipe._categories.contains('דגים')
                    )
                )
            elif dietary_type == 'dairy':
                query = query.filter(
                    or_(
                        Recipe._categories.contains('חלבי'),
                        Recipe._categories.contains('גבינה'),
                        Recipe._categories.contains('חלב')
                    )
                )
            elif dietary_type == 'pareve':
                query = query.filter(
                    and_(
                        ~Recipe._categories.contains('בשר'),
                        ~Recipe._categories.contains('עוף'),
                        ~Recipe._categories.contains('חלבי'),
                        ~Recipe._categories.contains('חלב')
                    )
                )

        # Apply course type filter
        if course_type:
            course_keywords = {
                'appetizer': ['מנה ראשונה', 'פתיח'],
                'salad': ['סלט', 'ירקות'],
                'soup': ['מרק'],
                'main': ['בשר', 'עוף', 'דג', 'עיקרי', 'מנה עיקרית'],
                'side': ['תוספת', 'אורז', 'פסטה', 'תפוחי אדמה'],
                'dessert': ['קינוח', 'עוגה', 'מתוק', 'עוגיות']
            }

            if course_type in course_keywords:
                keywords = course_keywords[course_type]
                conditions = [Recipe._categories.contains(kw) for kw in keywords]
                query = query.filter(or_(*conditions))

        # Apply cooking time filter
        if max_cooking_time:
            query = query.filter(
                or_(
                    Recipe.cooking_time <= max_cooking_time,
                    Recipe.cooking_time.is_(None)
                )
            )

        # Apply difficulty filter
        if difficulty:
            query = query.filter(Recipe.difficulty == difficulty)

        # Exclude specific IDs
        if exclude_ids:
            query = query.filter(~Recipe.id.in_(exclude_ids))

        # Order and limit
        query = query.order_by(
            Recipe.cooking_time.isnot(None).desc(),
            Recipe.difficulty.isnot(None).desc(),
            Recipe.updated_at.desc()
        ).limit(limit)

        recipes = query.all()

        # Return metadata
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
    def _execute_get_recipe_details(cls, recipe_id):
        """
        Get detailed information about a specific recipe.

        Args:
            recipe_id: The recipe ID

        Returns:
            dict: Full recipe details or error
        """
        recipe = Recipe.query.get(recipe_id)

        if not recipe:
            return {"error": f"Recipe {recipe_id} not found"}

        return {
            'id': recipe.id,
            'title': recipe.title,
            'categories': recipe._categories or '',
            'difficulty': recipe.difficulty.value if recipe.difficulty else 'medium',
            'cooking_time': recipe.cooking_time or 30,
            'preparation_time': recipe.preparation_time or 15,
            'servings': recipe.servings or 4,
            'ingredients_count': len(recipe.ingredients) if recipe.ingredients else 0,
            'has_image': bool(recipe.image_url or recipe.image_data)
        }

    @classmethod
    def _get_menu_planner_system_prompt(cls):
        """Get system prompt for menu planning with function calling"""
        return """You are an expert chef and menu planner specializing in kosher cuisine.

Your role is to create balanced, well-thought-out menu plans for various events using the tools available to you.

CRITICAL RULES:
1. KOSHER LAWS: NEVER mix meat (בשרי) and dairy (חלבי) in the same meal. Pareve (פרווה) can be mixed with either.
2. BALANCE: Create variety in flavors, textures, and cooking methods
3. TIMING: Consider total preparation time - don't overload with complex dishes
4. APPROPRIATENESS: Match sophistication to event type (Shabbat = festive, weekday = simpler)
5. PRACTICALITY: Choose realistic combinations that work well together

WORKFLOW:
1. Analyze the user's request (event type, servings, dietary restrictions, meals needed)
2. Use search_recipes() to find appropriate recipes for each meal and course
3. Build a complete, balanced menu
4. Validate your choices against the rules above
5. Return your final menu plan

SEARCH STRATEGY:
- Search by course type first (appetizer, main, dessert, etc.)
- Consider dietary restrictions in your searches
- Use max_cooking_time to balance the menu
- Use exclude_ids to avoid selecting the same recipe twice
- You can search multiple times to find the best options

RESPONSE FORMAT:
When you're done searching and ready to present the menu, respond with a JSON object:
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
          "reason": "Fresh salad to start the meal"
        }
      ]
    }
  ],
  "reasoning": "Overall explanation of why this menu works well"
}"""

    @classmethod
    def generate_menu(cls, user_id, preferences):
        """
        Generate menu using AI with Function Calling.
        AI will dynamically search for recipes as needed.

        Args:
            user_id: ID of user creating menu
            preferences: Dictionary with menu preferences

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

            # Build user prompt
            user_prompt = f"""Plan a complete menu for the following event:

Event Type: {event_type}
Number of Servings: {servings}
Dietary Restriction: {dietary_type.value if dietary_type else 'none'}
Meals Needed: {', '.join(meal_types)}
Special Requests: {special_requests if special_requests else 'none'}

Use the search_recipes tool to find appropriate recipes for each meal.
Search strategically - by course type, dietary restrictions, and complexity.
Build a balanced, delicious menu that follows all kosher laws.

When you're satisfied with your selections, return the final menu in JSON format."""

            # Configure AI with tools
            genai.configure(api_key=current_app.config["GOOGLE_API_KEY"])
            model = genai.GenerativeModel(
                model_name="gemini-2.0-flash-exp",  # Latest model with best function calling
                tools=cls._get_search_tools(),
                system_instruction=cls._get_menu_planner_system_prompt()
            )

            # Start conversation
            chat = model.start_chat()
            response = chat.send_message(user_prompt)

            # Handle function calling loop
            max_iterations = 15  # Increased from 10 for complex menus
            iteration = 0

            print(f"🤖 Starting AI menu generation (max {max_iterations} iterations)")

            while iteration < max_iterations:
                # Check if AI made function calls
                if response.candidates[0].content.parts[0].function_call:
                    function_calls = [
                        part.function_call
                        for part in response.candidates[0].content.parts
                        if hasattr(part, 'function_call')
                    ]

                    print(f"📞 Iteration {iteration + 1}: AI making {len(function_calls)} function call(s)")

                    # Execute all function calls
                    function_responses = []
                    for function_call in function_calls:
                        function_name = function_call.name
                        function_args = dict(function_call.args)

                        print(f"   → {function_name}({function_args})")

                        # Execute the function
                        if function_name == "search_recipes":
                            result = cls._execute_search_recipes(**function_args)
                        elif function_name == "get_recipe_details":
                            result = cls._execute_get_recipe_details(**function_args)
                        else:
                            result = {"error": f"Unknown function: {function_name}"}

                        result_count = len(result) if isinstance(result, list) else 1
                        print(f"   ← Returned {result_count} result(s)")

                        # Prepare response
                        function_responses.append(
                            genai.protos.Part(
                                function_response=genai.protos.FunctionResponse(
                                    name=function_name,
                                    response={"result": result}
                                )
                            )
                        )

                    # Send function results back to AI
                    response = chat.send_message(
                        genai.protos.Content(parts=function_responses)
                    )

                    iteration += 1
                else:
                    # AI is done - extract final response
                    print(f"✓ AI completed after {iteration} iterations")
                    break

            if iteration >= max_iterations:
                print(f"⚠️ WARNING: Reached max iterations ({max_iterations}), AI may not be finished")

            # Extract the final menu plan
            response_text = response.text

            print(f"📄 AI response length: {len(response_text)} characters")

            # Try to parse JSON from response
            # AI might wrap it in markdown code blocks
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()
            elif "```" in response_text:
                json_start = response_text.find("```") + 3
                json_end = response_text.find("```", json_start)
                response_text = response_text[json_start:json_end].strip()

            print(f"📋 Parsing menu plan JSON...")
            menu_plan = json.loads(response_text)

            # Log what AI returned
            total_recipes = sum(len(meal.get('recipes', [])) for meal in menu_plan.get('meals', []))
            print(f"📊 Menu plan summary:")
            print(f"   - Meals: {len(menu_plan.get('meals', []))}")
            print(f"   - Total recipes: {total_recipes}")
            for meal in menu_plan.get('meals', []):
                print(f"   - {meal.get('meal_type')}: {len(meal.get('recipes', []))} recipes")

            # Create menu in database
            menu = cls._create_menu_from_plan(
                user_id=user_id,
                preferences=preferences,
                menu_plan=menu_plan
            )

            return menu

        except Exception as e:
            print(f"Menu generation error: {str(e)}")
            import traceback
            traceback.print_exc()
            raise

    @classmethod
    def _create_menu_from_plan(cls, user_id, preferences, menu_plan):
        """
        Create menu database records from AI plan
        Validates all recipe IDs before creating the menu
        """
        try:
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
            db.session.flush()

            # Create meals and recipes
            for meal_data in menu_plan.get('meals', []):
                meal = MenuMeal(
                    menu_id=menu.id,
                    meal_type=meal_data.get('meal_type'),
                    meal_order=meal_data.get('meal_order'),
                    meal_time=meal_data.get('meal_time')
                )

                db.session.add(meal)
                db.session.flush()

                # Add recipes to meal - with validation
                for recipe_data in meal_data.get('recipes', []):
                    recipe_id = recipe_data.get('recipe_id')

                    # CRITICAL: Validate recipe exists before adding
                    recipe = Recipe.query.get(recipe_id)
                    if not recipe:
                        print(f"⚠️ WARNING: Recipe ID {recipe_id} not found in database, skipping")
                        continue

                    print(f"✓ Adding recipe {recipe_id}: {recipe.title}")

                    meal_recipe = MealRecipe(
                        menu_meal_id=meal.id,
                        recipe_id=recipe_id,
                        course_type=recipe_data.get('course_type'),
                        course_order=recipe_data.get('course_order', 0),
                        servings=preferences.get('servings'),
                        ai_reason=recipe_data.get('reason')
                    )

                    db.session.add(meal_recipe)

            db.session.commit()

            # Reload menu with all relationships
            menu = Menu.query.get(menu.id)

            print(f"✓ Menu created successfully: {menu.id} - {menu.name}")
            print(f"  Total meals: {len(menu.meals)}")
            for meal in menu.meals:
                print(f"    {meal.meal_type}: {len(meal.recipes)} recipes")

            return menu

        except Exception as e:
            db.session.rollback()
            print(f"❌ Error creating menu from plan: {str(e)}")
            import traceback
            traceback.print_exc()
            raise

    @classmethod
    def suggest_recipe_replacement(cls, menu_meal_id, current_recipe_id, course_type):
        """
        Suggest alternative recipes (unchanged - works with existing code)
        """
        try:
            meal = MenuMeal.query.get(menu_meal_id)
            if not meal:
                return []

            menu = meal.menu

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

            # Filter by course type
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
