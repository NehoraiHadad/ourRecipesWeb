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

        # Return metadata with more details for AI
        return [
            {
                'id': recipe.id,
                'title': recipe.title,
                'categories': recipe._categories or '',
                'difficulty': recipe.difficulty.value if recipe.difficulty else 'medium',
                'cooking_time': recipe.cooking_time or 30,
                'preparation_time': recipe.preparation_time or 15,
                'servings': recipe.servings or 4,
                'has_image': bool(recipe.image_url or recipe.image_data),
                # Add more context for AI decision-making
                'ingredients_preview': cls._get_ingredients_preview(recipe),
                'description_preview': cls._get_description_preview(recipe),
                'tags': recipe._categories.split(',') if recipe._categories else []
            }
            for recipe in recipes
        ]

    @classmethod
    def _get_ingredients_preview(cls, recipe):
        """Get first 5 ingredients as preview"""
        if not recipe.ingredients:
            return ""

        try:
            # Get first 5 ingredients
            ingredients = recipe.ingredients[:5]
            names = [ing.get('name', ing.get('ingredient', '')) for ing in ingredients if ing]
            preview = ', '.join([name for name in names if name])

            if len(recipe.ingredients) > 5:
                preview += f" (ועוד {len(recipe.ingredients) - 5})"

            return preview
        except:
            return ""

    @classmethod
    def _get_description_preview(cls, recipe):
        """Get short description preview from instructions or raw content"""
        try:
            # Try instructions first (more structured)
            if hasattr(recipe, '_instructions') and recipe._instructions:
                desc = recipe._instructions[:100]
                if len(recipe._instructions) > 100:
                    desc += "..."
                return desc
            # Fallback to raw_content
            elif hasattr(recipe, 'raw_content') and recipe.raw_content:
                desc = recipe.raw_content[:100]
                if len(recipe.raw_content) > 100:
                    desc += "..."
                return desc
            return ""
        except:
            return ""

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

⚠️ CRITICAL INSTRUCTION:
YOU MUST USE THE search_recipes() FUNCTION TO FIND RECIPES.
DO NOT INVENT OR GUESS RECIPE IDs.
ONLY USE RECIPE IDs RETURNED FROM search_recipes() FUNCTION CALLS.

WORKFLOW (MANDATORY):
1. Analyze the user's request (event type, servings, dietary restrictions, meals needed)
2. For EACH meal and course type:
   a. Call search_recipes() with appropriate filters
   b. Review the results
   c. Select recipes from the returned list ONLY
3. Build the complete menu using ONLY the recipe IDs you found
4. Validate against kosher laws and balance
5. Return the final JSON

KOSHER LAWS (MUST FOLLOW):
1. NEVER mix meat (בשרי) and dairy (חלבי) in the same meal
2. Pareve (פרווה) can be mixed with either meat or dairy
3. If a meal is meat, ALL recipes must be meat or pareve
4. If a meal is dairy, ALL recipes must be dairy or pareve

BALANCE REQUIREMENTS:
1. Variety in flavors, textures, and cooking methods
2. Don't overload with complex/time-consuming dishes
3. Match sophistication to event type (Shabbat = festive, weekday = simpler)
4. Use exclude_ids to prevent selecting the same recipe twice

SEARCH STRATEGY:
1. Search by course_type for each course needed
2. Use dietary_type filter to match meal requirements
3. Use max_cooking_time to balance complexity
4. Use exclude_ids=[previous_recipe_ids] to avoid duplicates
5. Search multiple times if needed to find better options
6. ⚠️ IMPORTANT: If a search returns 0 results after 2-3 attempts, SKIP that course and move on
7. ⚠️ DO NOT search endlessly - prioritize completing the menu with available recipes

EXAMPLE WORKFLOW:
User wants: Shabbat dinner, 4 servings, meat meal

Step 1: Search for salads
→ Call: search_recipes(course_type="salad", dietary_type="pareve", limit=5)
→ Get: [{id: 10, title: "Israeli Salad"}, {id: 15, title: "Coleslaw"}...]
→ Select: 10

Step 2: Search for main courses
→ Call: search_recipes(course_type="main", dietary_type="meat", exclude_ids=[10], limit=5)
→ Get: [{id: 25, title: "Roast Chicken"}, {id: 30, title: "Beef Stew"}...]
→ Select: 25

Step 3: Search for sides
→ Call: search_recipes(course_type="side", dietary_type="pareve", exclude_ids=[10, 25], limit=5)
→ Get: [{id: 40, title: "Roasted Potatoes"}...]
→ Select: 40

Step 4: Return JSON with IDs 10, 25, 40

FINAL RESPONSE FORMAT:
{
  "meals": [
    {
      "meal_type": "ארוחת ערב שבת",
      "meal_order": 1,
      "recipes": [
        {
          "recipe_id": 10,
          "course_type": "salad",
          "course_order": 1,
          "reason": "Fresh Israeli salad to start the meal"
        },
        {
          "recipe_id": 25,
          "course_type": "main",
          "course_order": 2,
          "reason": "Festive roast chicken, perfect for Shabbat"
        },
        {
          "recipe_id": 40,
          "course_type": "side",
          "course_order": 3,
          "reason": "Roasted potatoes complement the chicken well"
        }
      ]
    }
  ],
  "reasoning": "This Shabbat dinner menu offers a balanced meat meal with fresh salad, hearty main course, and complementary side. All items are kosher-compliant (meat or pareve)."
}

REMEMBER: ONLY use recipe IDs returned from search_recipes() function calls!"""

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

            # Build user prompt - FORCE tool usage
            user_prompt = f"""IMPORTANT: You MUST use the search_recipes() function to find recipes. Do NOT respond with a menu until you have searched for recipes first.

Plan a complete menu for the following event:

Event Type: {event_type}
Number of Servings: {servings}
Dietary Restriction: {dietary_type.value if dietary_type else 'none'}
Meals Needed: {', '.join(meal_types)}
Special Requests: {special_requests if special_requests else 'none'}

STEP 1: For each meal type, call search_recipes() with appropriate filters
STEP 2: Review the recipes returned
STEP 3: Build the menu using ONLY the recipe IDs you found
STEP 4: Return the final JSON

⚠️ IMPORTANT: If a search returns 0 results after 2-3 attempts, skip that course and continue.
Do NOT search endlessly - complete the menu with the recipes you successfully find.

Start by searching for recipes now. Do not skip this step."""

            # Configure AI with tools - FORCE function calling
            genai.configure(api_key=current_app.config["GOOGLE_API_KEY"])
            model = genai.GenerativeModel(
                # Using Flash-Lite: 1,000 RPD (vs 25 RPD), 15 RPM (vs 5 RPM)
                model_name="gemini-2.5-flash-lite",
                tools=cls._get_search_tools(),
                system_instruction=cls._get_menu_planner_system_prompt(),
                # Force the model to use tools
                tool_config={'function_calling_config': {'mode': 'ANY'}}
            )

            # Start conversation
            chat = model.start_chat()
            response = chat.send_message(user_prompt)

            # Handle function calling loop
            max_iterations = 25  # Increased to handle complex multi-meal menus
            iteration = 0

            print(f"🤖 Starting AI menu generation (max {max_iterations} iterations)")

            while iteration < max_iterations:
                # Check if AI made function calls (check all parts, not just first)
                has_function_call = any(
                    hasattr(part, 'function_call') and part.function_call
                    for part in response.candidates[0].content.parts
                )

                if has_function_call:
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

                # Check if AI is still trying to make function calls
                still_has_function_call = any(
                    hasattr(part, 'function_call') and part.function_call
                    for part in response.candidates[0].content.parts
                )

                if still_has_function_call:
                    print(f"⚠️ AI still has pending function calls, forcing completion...")

                    # Send a message to force AI to finish with what it has
                    completion_prompt = """You have reached the maximum number of searches.
Please create the menu using ONLY the recipes you have found so far.
If you couldn't find enough recipes for some courses, skip those courses.
Return the JSON menu plan now with the recipes you successfully found."""

                    try:
                        response = chat.send_message(completion_prompt)
                        print(f"✓ Forced completion successful")
                    except Exception as e:
                        print(f"❌ Failed to force completion: {e}")
                        raise ValueError(f"AI could not complete menu generation after {max_iterations} iterations. Try reducing the number of meals or courses.")

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
