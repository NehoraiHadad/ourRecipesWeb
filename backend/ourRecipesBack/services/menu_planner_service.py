import google.generativeai as genai
from google.api_core import exceptions as google_exceptions
from flask import current_app
import json
import time
from sqlalchemy import and_, or_
from ..extensions import db
from ..models import Recipe, Menu, MenuMeal, MealRecipe
from ..models.enums import DietaryType, RecipeStatus


class MenuPlannerService:
    """Service for AI-powered menu planning with Function Calling"""

    @classmethod
    def _send_message_with_retry(cls, chat, message, max_retries=3):
        """
        Send message to AI with automatic retry on rate limit.

        Args:
            chat: The chat session
            message: Message to send (can be string or Content)
            max_retries: Maximum number of retries (default: 3)

        Returns:
            Response from AI

        Raises:
            Exception: If all retries are exhausted
        """
        retry_count = 0

        while retry_count <= max_retries:
            try:
                return chat.send_message(message)

            except google_exceptions.ResourceExhausted as rate_limit_error:
                retry_count += 1

                # Extract retry delay from error if available
                error_str = str(rate_limit_error)
                wait_time = 60  # Default to 60 seconds as user requested

                # Try to parse retry delay from error message
                # Error format: "retry_delay: {seconds: 27}"
                if "retry_delay" in error_str and "seconds:" in error_str:
                    try:
                        import re
                        match = re.search(r'seconds:\s*(\d+)', error_str)
                        if match:
                            wait_time = int(match.group(1))
                    except Exception:
                        pass  # Keep default wait_time

                if retry_count <= max_retries:
                    print(f"⏳ Rate limit reached! Waiting {wait_time} seconds before retry ({retry_count}/{max_retries})...")
                    time.sleep(wait_time)
                    print(f"🔄 Retrying request (attempt {retry_count + 1}/{max_retries + 1})...")
                else:
                    print(f"❌ Rate limit exhausted after {max_retries} retries")
                    raise

            except Exception as e:
                # Re-raise other exceptions immediately
                raise

    @staticmethod
    def _get_search_tools():
        """
        Define tools that AI can use - ONLY get_all_recipes.
        No search_recipes to prevent AI from making multiple queries.
        """
        return [
            {
                "function_declarations": [
                    {
                        "name": "get_all_recipes",
                        "description": "Get ALL available recipes (~113 recipes). Returns ENHANCED data for each recipe: id, title, dietary_type, course_hints, cooking_time, difficulty, servings, ingredients_preview, has_image. This is the COMPLETE catalog - you only need to call this ONCE. Use the data to pick 3-6 recipes that fit the menu requirements.",
                        "parameters": {
                            "type": "object",
                            "properties": {},
                            "required": []
                        }
                    }
                ]
            }
        ]

    @classmethod
    def _execute_search_recipes(cls, dietary_type=None, course_type=None,
                                max_cooking_time=None, difficulty=None,
                                limit=30, exclude_ids=None):
        """
        Execute a recipe search based on AI's request.

        Args:
            dietary_type: Dietary restriction (meat/dairy/pareve)
            course_type: Type of course (appetizer/main/etc)
            max_cooking_time: Maximum cooking time in minutes
            difficulty: Recipe difficulty
            limit: Maximum results to return (default: 30 for efficiency)
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

        # FALLBACK: If no results and we had dietary_type, try again without it
        # This prevents AI from searching endlessly for non-existent combinations
        if len(recipes) == 0 and dietary_type and course_type:
            print(f"⚠️ No recipes found for {course_type} + {dietary_type}, trying without dietary filter...")
            return cls._execute_search_recipes(
                dietary_type=None,  # Remove dietary filter
                course_type=course_type,
                max_cooking_time=max_cooking_time,
                difficulty=difficulty,
                limit=limit,
                exclude_ids=exclude_ids
            )

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

⚠️ CRITICAL WORKFLOW - READ CAREFULLY:

YOU HAVE EXACTLY 2 ITERATIONS:
Iteration 1: Call get_all_recipes() to get the COMPLETE catalog
Iteration 2: Return the final JSON menu

STEP 1 (Iteration 1): Call get_all_recipes() ONE TIME ONLY
   - Returns: ALL ~113 recipes with full details
   - Each recipe includes: id, title, dietary_type, course_hints, cooking_time, difficulty, servings, ingredients_preview
   - This is the COMPLETE catalog - you will NOT get another chance to call this function

STEP 2 (Iteration 2): IMMEDIATELY return the JSON menu
   - Analyze the recipes you received in iteration 1
   - Pick 3-6 recipe IDs that fit the user's requirements
   - Return ONLY the JSON menu structure
   - DO NOT call get_all_recipes() again - you already have all the data

⚠️ IMPORTANT: After calling get_all_recipes() ONCE, you MUST return JSON in the next iteration.
DO NOT call get_all_recipes() multiple times - the catalog doesn't change!

KOSHER LAWS (MUST FOLLOW):
1. NEVER mix meat (בשרי) and dairy (חלבי) in the same meal
2. Pareve (פרווה) can be mixed with either meat or dairy
3. If a meal is meat, ALL recipes must be meat or pareve
4. If a meal is dairy, ALL recipes must be dairy or pareve

EXAMPLE - EXACT WORKFLOW:
User requests: "Shabbat dinner, meat meal"

Iteration 1:
→ Call get_all_recipes()
← Receive list: [{id:41, title:"עוף בגריל", dietary_type:"meat", course_hints:["main"], cooking_time:60, difficulty:"medium", servings:4, ingredients_preview:"עוף, שום, לימון"}, ...]

Iteration 2:
→ Return JSON (DO NOT CALL FUNCTIONS):
{
  "meals": [{
    "meal_type": "ארוחת ערב שבת",
    "meal_order": 1,
    "recipes": [
      {"recipe_id": 15, "course_type": "salad", "course_order": 1},
      {"recipe_id": 41, "course_type": "main", "course_order": 2}
    ]
  }],
  "reasoning": "בחרתי סלט קל כמנה ראשונה ועוף בגריל כמנה עיקרית"
}

CRITICAL RULES:
- TOTAL iterations: 2 (1 function call + 1 JSON response)
- Call get_all_recipes() EXACTLY ONCE
- After receiving recipes, RETURN JSON IMMEDIATELY
- DO NOT repeat function calls"""

    @classmethod
    def _execute_get_all_recipes(cls):
        """
        Execute get_all_recipes function - returns ENHANCED info for ALL recipes.
        This is STEP 1: Get the catalog to choose from.

        Returns: id, title, dietary_type, course_hints, cooking_time, difficulty, servings, ingredients_preview

        Returns:
            list: All recipes with enhanced metadata for better AI decision-making
        """
        print(f"   📚 Loading recipe catalog with enhanced metadata...")
        recipes = Recipe.query.filter(
            Recipe.status == RecipeStatus.ACTIVE.value,
            Recipe.is_parsed == True,
            Recipe.title.isnot(None)
        ).all()
        print(f"   ✓ Loaded {len(recipes)} recipes")

        result = []

        for recipe in recipes:
            categories = recipe._categories or ''

            # Determine dietary type from categories
            dietary = 'pareve'  # default
            if any(cat in categories for cat in ['בשר', 'עוף', 'דגים']):
                dietary = 'meat'
            elif any(cat in categories for cat in ['חלבי', 'גבינה', 'חלב']):
                dietary = 'dairy'

            # Determine course type from categories
            course_hints = []
            if any(cat in categories for cat in ['סלט', 'ירקות']):
                course_hints.append('salad')
            if any(cat in categories for cat in ['מרק']):
                course_hints.append('soup')
            if any(cat in categories for cat in ['בשר', 'עוף', 'דג', 'עיקרי']):
                course_hints.append('main')
            if any(cat in categories for cat in ['תוספת', 'אורז', 'פסטה', 'תפוחי אדמה']):
                course_hints.append('side')
            if any(cat in categories for cat in ['קינוח', 'עוגה', 'מתוק', 'עוגיות']):
                course_hints.append('dessert')

            # Get ingredients preview (first 3 ingredients)
            ingredients_preview = ""
            try:
                # Use ingredients_list (JSON) if available, fallback to ingredients (text)
                if recipe.ingredients_list and isinstance(recipe.ingredients_list, list):
                    first_ingredients = recipe.ingredients_list[:3]
                    names = [ing.get('name', ing.get('ingredient', '')) for ing in first_ingredients if isinstance(ing, dict)]
                    ingredients_preview = ', '.join([name for name in names if name])
                    if len(recipe.ingredients_list) > 3:
                        ingredients_preview += f" (+{len(recipe.ingredients_list) - 3})"
                elif recipe.ingredients:
                    # Fallback: ingredients is list of strings
                    first_ingredients = recipe.ingredients[:3]
                    ingredients_preview = ', '.join([str(ing) for ing in first_ingredients if ing])
                    if len(recipe.ingredients) > 3:
                        ingredients_preview += f" (+{len(recipe.ingredients) - 3})"
            except Exception as e:
                pass  # Silently fail, return empty preview

            # Return ENHANCED info for better AI decisions
            result.append({
                'id': recipe.id,
                'title': recipe.title,
                'dietary_type': dietary,
                'course_hints': course_hints,
                'cooking_time': recipe.cooking_time or 30,
                'difficulty': recipe.difficulty.value if recipe.difficulty else 'medium',
                'servings': recipe.servings or 4,
                'ingredients_preview': ingredients_preview,
                'has_image': bool(recipe.image_url or recipe.image_data)
            })

        return result

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

            # Build user prompt - CLEAR AND DIRECTIVE
            user_prompt = f"""Create menu for:
Event: {event_type}
Servings: {servings}
Dietary: {dietary_type.value if dietary_type else 'any'}
Meals: {', '.join(meal_types)}
{f'Notes: {special_requests}' if special_requests else ''}

⚠️ REMEMBER: You have EXACTLY 2 iterations total:
- Iteration 1: Call get_all_recipes() to get the complete catalog
- Iteration 2: Return the final JSON menu

Start NOW with get_all_recipes() - this is iteration 1."""

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
            response = cls._send_message_with_retry(chat, user_prompt)

            # Handle function calling loop
            max_iterations = 3  # Should only need 2: get_all_recipes() + return JSON
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
                    total_results = 0

                    for function_call in function_calls:
                        function_name = function_call.name
                        function_args = dict(function_call.args)

                        print(f"   → {function_name}({function_args})")

                        # Execute the function with error handling
                        try:
                            if function_name == "get_all_recipes":
                                result = cls._execute_get_all_recipes()
                            else:
                                print(f"   ⚠️ Invalid function: {function_name} - only get_all_recipes is allowed")
                                result = {"error": f"Function '{function_name}' not available. Use get_all_recipes() only."}
                        except Exception as func_error:
                            print(f"   ⚠️ Function error: {str(func_error)}")
                            result = {"error": f"Function execution failed: {str(func_error)}"}

                        result_count = len(result) if isinstance(result, list) else 1
                        total_results = result_count  # Save for guidance message
                        print(f"   ← Returned {result_count} result(s)")

                        # Prepare response with dynamic guidance
                        function_responses.append(
                            genai.protos.Part(
                                function_response=genai.protos.FunctionResponse(
                                    name=function_name,
                                    response={"result": result}
                                )
                            )
                        )

                    # Add dynamic guidance after function results
                    guidance_message = f"""
✓ You received the complete recipe catalog ({total_results} recipes).
⚠️ ITERATION {iteration + 1}/{max_iterations} - Next action required:

NOW you must IMMEDIATELY return the final JSON menu.
DO NOT call get_all_recipes() again - you already have ALL the data you need.

Analyze the recipes you received and return ONLY the JSON menu structure:
{{
  "meals": [...],
  "reasoning": "..."
}}

DO NOT make any more function calls. Return JSON NOW.
"""

                    # Send function results back to AI with guidance
                    all_parts = function_responses + [genai.protos.Part(text=guidance_message)]
                    response = cls._send_message_with_retry(
                        chat,
                        genai.protos.Content(parts=all_parts)
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
                    print(f"⚠️ AI still has pending function calls, executing them first...")

                    # Execute the pending function calls one last time
                    function_calls = [
                        part.function_call
                        for part in response.candidates[0].content.parts
                        if hasattr(part, 'function_call')
                    ]

                    print(f"📞 Final iteration: AI making {len(function_calls)} function call(s)")

                    # Execute all function calls
                    function_responses = []
                    total_results = 0

                    for function_call in function_calls:
                        function_name = function_call.name
                        function_args = dict(function_call.args)

                        print(f"   → {function_name}({function_args})")

                        # Execute the function with error handling
                        try:
                            if function_name == "get_all_recipes":
                                result = cls._execute_get_all_recipes()
                            else:
                                print(f"   ⚠️ Invalid function: {function_name} - only get_all_recipes is allowed")
                                result = {"error": f"Function '{function_name}' not available. Use get_all_recipes() only."}
                        except Exception as func_error:
                            print(f"   ⚠️ Function error: {str(func_error)}")
                            result = {"error": f"Function execution failed: {str(func_error)}"}

                        result_count = len(result) if isinstance(result, list) else 1
                        total_results = result_count
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

                    # Send function results back to AI with VERY STRONG completion instruction
                    completion_prompt = f"""
🚨 MAXIMUM ITERATIONS REACHED ({max_iterations}/{max_iterations})
✓ You received the complete recipe catalog ({total_results} recipes).

⚠️ CRITICAL: You have reached the maximum number of iterations allowed.
You MUST create the menu NOW using ONLY the recipes you have received.

DO NOT make any more function calls.
DO NOT call get_all_recipes() again.

Return ONLY the final JSON menu plan NOW:
{{
  "meals": [...],
  "reasoning": "..."
}}

This is your LAST chance to respond. Return JSON immediately."""

                    # Send the function responses WITH the strong guidance
                    all_parts = function_responses + [genai.protos.Part(text=completion_prompt)]
                    response = cls._send_message_with_retry(
                        chat,
                        genai.protos.Content(parts=all_parts)
                    )

                    # If STILL has function calls, send one more VERY forceful message
                    final_has_function_call = any(
                        hasattr(part, 'function_call') and part.function_call
                        for part in response.candidates[0].content.parts
                    )

                    if final_has_function_call:
                        print(f"⚠️ AI still trying to call functions, sending final force completion...")
                        try:
                            response = cls._send_message_with_retry(chat, completion_prompt)
                        except Exception as e:
                            print(f"❌ Failed to force completion: {e}")
                            raise ValueError(f"AI could not complete menu generation after {max_iterations} iterations. Try reducing the number of meals or courses.")

                    # Final check - if STILL has function calls, we give up and return error
                    ultimate_check = any(
                        hasattr(part, 'function_call') and part.function_call
                        for part in response.candidates[0].content.parts
                    )

                    if ultimate_check:
                        print(f"❌ AI refuses to stop making function calls")
                        raise ValueError(f"AI model is stuck in function calling loop. Please try again with simpler requirements or fewer courses.")

                    print(f"✓ Forced completion successful")

            # Extract the final menu plan
            try:
                response_text = response.text
            except ValueError as e:
                # This happens if response still has function_call
                print(f"❌ Error extracting text from response: {e}")
                print(f"Response parts: {[type(part).__name__ for part in response.candidates[0].content.parts]}")
                raise ValueError("AI model failed to generate text response. It may be stuck trying to make function calls. Please try again.")

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
            try:
                menu_plan = json.loads(response_text)
            except json.JSONDecodeError as e:
                print(f"❌ Failed to parse JSON from AI response")
                print(f"Response text: {response_text[:500]}...")
                raise ValueError(f"AI returned invalid JSON. Please try again. Error: {str(e)}")

            # Validate menu structure
            if not menu_plan.get('meals'):
                raise ValueError("AI returned empty menu. Please try again with different parameters.")

            # Log what AI returned
            total_recipes = sum(len(meal.get('recipes', [])) for meal in menu_plan.get('meals', []))
            print(f"📊 Menu plan summary:")
            print(f"   - Meals: {len(menu_plan.get('meals', []))}")
            print(f"   - Total recipes: {total_recipes}")
            for meal in menu_plan.get('meals', []):
                print(f"   - {meal.get('meal_type')}: {len(meal.get('recipes', []))} recipes")

            # Create menu in database
            try:
                menu = cls._create_menu_from_plan(
                    user_id=user_id,
                    preferences=preferences,
                    menu_plan=menu_plan
                )
            except Exception as db_error:
                print(f"❌ Database error while creating menu: {str(db_error)}")
                raise ValueError(f"Failed to save menu to database. Please try again.")

            return menu

        except google_exceptions.ResourceExhausted as rate_error:
            print(f"❌ Rate limit exceeded: {str(rate_error)}")
            raise ValueError("AI service is temporarily unavailable due to rate limits. Please wait a minute and try again.")

        except ValueError as val_error:
            # Re-raise ValueError with user-friendly message
            print(f"❌ Validation error: {str(val_error)}")
            raise

        except Exception as e:
            print(f"❌ Unexpected error during menu generation: {str(e)}")
            import traceback
            traceback.print_exc()
            raise ValueError(f"Menu generation failed: {str(e)}. Please try again with different parameters.")

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
