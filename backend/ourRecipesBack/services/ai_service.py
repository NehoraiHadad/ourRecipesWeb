from google import genai
from google.genai import types
from flask import current_app
import requests
import base64
import json


class AIService:
    """Service for handling AI-related operations"""

    @staticmethod
    def _get_recipe_prompt():
        """Get base prompt for recipe generation"""
        return """
        התנהג כמו שף מקצועי שיודע להכין מתכונים ביתיים לפי דרישות שונות. 
        הכן מתכונים שמתאימים לרכיבים שהמשתמש מספק (אם הוא מספק. אם לא - בחר רכיבים ביתיים בעצמך), 
        ולפי סוג הארוחה, שקול גם אם המתכון צריך להיות מתאים לילדים, להכנה מהירה, 
        או לבקשות נוספות שהמשתמש עשוי להציע.

        התשובה צריכה להיות בדיוק בפורמט הבא ללא עיצוב טקסט או תוספות:

        כותרת: [שם המתכון]
        קטגוריות: [קטגוריות מופרדות בפסיקים]
        זמן הכנה: [זמן בדקות]
        רמת קושי: [קל/בינוני/מורכב]
        רשימת מצרכים:
        - [מצרך 1]
        - [מצרך 2]
        הוראות הכנה:
        [הוראות ההכנה]
        """

    @classmethod
    def generate_recipe_suggestion(
        cls,
        ingredients="",
        meal_type=None,
        quick_prep=False,
        child_friendly=False,
        additional_requests="",
    ):
        """
        Generate recipe suggestion using AI

        Args:
            ingredients (str): Available ingredients
            meal_type (list): Type of meal (breakfast/lunch/dinner)
            quick_prep (bool): Whether recipe should be quick to prepare
            child_friendly (bool): Whether recipe should be kid-friendly
            additional_requests (str): Any additional requirements

        Returns:
            str: Generated recipe text
        """
        try:
            # Create AI client
            client = genai.Client(api_key=current_app.config["GOOGLE_API_KEY"])

            # Build user prompt parts
            prompt_parts = []
            if ingredients:
                prompt_parts.append(f"יש לי את המרכיבים הבאים: {ingredients}")
            if meal_type:
                prompt_parts.append(f"אני רוצה להכין {meal_type}")
            if quick_prep:
                prompt_parts.append("המתכון צריך להיות מתאים להכנה מהירה")
            if child_friendly:
                prompt_parts.append("המתכון צריך להיות מותאם לילדים")
            if additional_requests:
                prompt_parts.append(f"בנוסף התייחס לזה: {additional_requests}")

            prompt_parts.append("יש לך הצעה למתכון?")

            # Join all parts with periods
            user_prompt = ". ".join(prompt_parts)

            # Generate response using new API
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=cls._get_recipe_prompt()
                )
            )
            return response.text

        except Exception as e:
            print(f"AI generation error: {str(e)}")
            raise

    @classmethod
    async def generate_recipe_image(cls, recipe_content):
        """
        Generate image for recipe using AI

        Args:
            recipe_content (str): Recipe text to generate image for

        Returns:
            str: Base64 encoded image
        """
        try:
            # First get image prompt from language model using new SDK
            client = genai.Client(api_key=current_app.config["GOOGLE_API_KEY"])

            prompt_request = f"""
            Create a detailed English prompt for generating an image of this recipe: {recipe_content}.
            The prompt should describe the perfect photo for this dish.
            Focus on the final dish appearance, plating, and food photography aspects.
            Keep the prompt under 100 words.
            """

            prompt_response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt_request
            )

            # Use prompt to generate image
            API_URL = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev"
            headers = {"Authorization": current_app.config["HF_TOKEN"]}

            response = requests.post(
                API_URL, headers=headers, json={"inputs": prompt_response.text}
            )

            if response.status_code != 200:
                raise Exception(f"Image generation failed: {response.text}")

            # Convert response to base64
            image_bytes = response.content
            return base64.b64encode(image_bytes).decode("utf-8")

        except Exception as e:
            print(f"Image generation error: {str(e)}")
            raise

    @classmethod
    def reformat_recipe(cls, recipe_text):
        """
        Reformat recipe text to a structured format

        Args:
            recipe_text (str): Raw recipe text to format

        Returns:
            str: Formatted recipe text
        """
        try:
            system_prompt = """המטרה: לארגן את המתכון הבא לפורמט ברור ומסודר שיכלול שלושה חלקים עיקריים: כותרת, רשימת מצרכים והוראות הכנה. הפורמט צריך להיות קבוע וחזרתי כדי שיהיה נוח לקרוא בטלגרם ולהציג באפליקציה. השתמש בפיסוק ברור ובעברית תקנית. אל תשנה או תוסיף תוכן כמו רכיבים או כמויות או פעולות לביצוע - המטרה לארגן. אם יש רכיב או פעולה שאינך מבין החזר אותו כמו שהוא.

            הנה כמה הנחיות נוספות:
            1. זמן הכנה: הערך את זמן ההכנה בדקות (למשל: "זמן הכנה: 30 דקות")
            2. רמת קושי: בחר אחד מהבאים: קל, בינוני, מורכב
            3. קטגוריות: הוסף קטגוריות מתאימות מופרדות בפסיקים

            דוגמה למתכון אחרי העיבוד:

            כותרת: עוגת שוקולד פשוטה ומהירה
            קטגוריות: עוגות, קינוחים, אפייה
            זמן הכנה: 45 דקות
            רמת קושי: קל
            רשימת מצרכים:
            - 2 ביצים
            - 1 כוס סוכר
            - 1 כוס קמח
            - חצי כוס שמן
            - חצי חבילה של שוקולד
            - חצי שקית אבקת אפייה
            הוראות הכנה:
            1. לחמם את התנור ל-180 מעלות.
            2. בקערה גדולה, לערבב יחד את הביצים, הסוכר, הקמח, השמן, השוקולד ואבקת האפייה.
            3. לשפוך את התערובת לתבנית ונאפה עד שהעוגה מוכנה.

            שים לב:
            - הערך את זמן ההכנה בדקות לפי המתכון
            - בחר רמת קושי מתאימה: קל/בינוני/מורכב
            """

            # Use new SDK
            client = genai.Client(api_key=current_app.config["GOOGLE_API_KEY"])

            # Generate response
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=recipe_text,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt
                )
            )
            return response.text

        except Exception as e:
            print(f"Recipe reformatting error: {str(e)}")
            raise

    @classmethod
    def refine_recipe(cls, recipe_text, refinement_request):
        """
        Refine an existing recipe based on user feedback

        Args:
            recipe_text (str): The original recipe text
            refinement_request (str): User's refinement request

        Returns:
            str: Refined recipe text
        """
        try:
            system_instruction = """
                התנהג כמו שף מקצועי שיודע לשפר מתכונים קיימים לפי בקשות המשתמש.
                אתה מקבל מתכון קיים ובקשה לשיפור. עליך לשמור על מבנה המתכון המקורי אבל לשנות אותו לפי הבקשה.

                המתכון צריך להישאר בדיוק באותו פורמט:

                כותרת: [שם המתכון]
                קטגוריות: [קטגוריות מופרדות בפסיקים]
                זמן הכנה: [זמן בדקות]
                רמת קושי: [קל/בינוני/מורכב]
                רשימת מצרכים:
                - [מצרך 1]
                - [מצרך 2]
                הוראות הכנה:
                [הוראות ההכנה]
                """

            # Build prompt
            prompt = f"""
            זהו המתכון המקורי:
            {recipe_text}

            בקשת השיפור של המשתמש:
            {refinement_request}

            אנא שפר את המתכון לפי הבקשה תוך שמירה על אותו פורמט בדיוק.
            """

            # Use new SDK
            client = genai.Client(api_key=current_app.config["GOOGLE_API_KEY"])

            # Generate response
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction
                )
            )
            return response.text

        except Exception as e:
            print(f"Recipe refinement error: {str(e)}")
            raise

    @classmethod
    def _extract_recipe_metadata(cls, recipe_content):
        """
        Extract key metadata from recipe content for infographic generation.
        Handles both formatted recipes (with כותרת:, רשימת מצרכים:, etc.)
        and unformatted raw recipes.

        Args:
            recipe_content (str): Full recipe text

        Returns:
            dict: Extracted metadata (title, prep_time, difficulty, ingredients_count, steps_count, is_formatted)
        """
        import re

        # Check if recipe is in standard format
        is_formatted = bool(re.search(r'כותרת:', recipe_content))

        if is_formatted:
            # Extract from formatted recipe
            title_match = re.search(r'כותרת:\s*(.+)', recipe_content)
            title = title_match.group(1).strip() if title_match else "מתכון טעים"

            time_match = re.search(r'זמן הכנה:\s*(.+)', recipe_content)
            prep_time = time_match.group(1).strip() if time_match else None

            difficulty_match = re.search(r'רמת קושי:\s*(.+)', recipe_content)
            difficulty = difficulty_match.group(1).strip() if difficulty_match else None

            # Count ingredients
            ingredients_section = re.search(r'רשימת מצרכים:\s*([\s\S]*?)(?:הוראות הכנה:|$)', recipe_content)
            ingredients_count = 0
            if ingredients_section:
                ingredients_text = ingredients_section.group(1)
                ingredients_count = len(re.findall(r'^[\s]*-\s*.+', ingredients_text, re.MULTILINE))

            # Count preparation steps
            steps_section = re.search(r'הוראות הכנה:\s*([\s\S]*?)$', recipe_content)
            steps_count = 0
            if steps_section:
                steps_text = steps_section.group(1)
                # Count numbered steps (1. 2. 3. etc.) or bullet points
                steps_count = len(re.findall(r'^\s*(?:\d+[\.\)]\s*|[-•]\s*).+', steps_text, re.MULTILINE))
                # If no numbered/bullet steps found, count non-empty lines
                if steps_count == 0:
                    steps_count = len([line for line in steps_text.strip().split('\n') if line.strip()])
        else:
            # Fallback for unformatted recipes
            # Use first non-empty line as title
            lines = [line.strip() for line in recipe_content.split('\n') if line.strip()]
            title = lines[0][:50] if lines else "מתכון טעים"  # Limit title length

            prep_time = None
            difficulty = None
            ingredients_count = 0
            steps_count = 0

            # Try to estimate from content
            # Count lines that look like ingredients (contain quantities/units)
            ingredient_patterns = len(re.findall(r'(?:כוס|כפ|ג|מ"ל|גרם|יחידות?|חתיכות?|\d+)', recipe_content))
            if ingredient_patterns > 0:
                ingredients_count = min(ingredient_patterns, 15)  # Cap at reasonable number

        return {
            'title': title,
            'prep_time': prep_time,
            'difficulty': difficulty,
            'ingredients_count': ingredients_count,
            'steps_count': steps_count,
            'is_formatted': is_formatted
        }

    @classmethod
    async def generate_recipe_infographic(cls, recipe_content):
        """
        Generate infographic image for recipe using Gemini 3 Pro Image (Nano Banana Pro)

        This function uses Google's latest Nano Banana Pro model which excels at:
        - Creating text in multiple languages (including Hebrew) within images
        - Generating infographics with structured information
        - High-resolution outputs (1K, 2K, 4K)

        Args:
            recipe_content (str): Recipe text in Hebrew to generate infographic for

        Returns:
            str: Base64 encoded image
        """
        try:
            # Create AI client with Nano Banana Pro API key (paid account)
            api_key = current_app.config.get("GOOGLE_API_KEY_NANO_BANANA") or current_app.config["GOOGLE_API_KEY"]
            client = genai.Client(api_key=api_key)

            # Extract key metadata from recipe
            metadata = cls._extract_recipe_metadata(recipe_content)

            # Build metadata badges for the infographic
            badges = []
            if metadata['prep_time']:
                badges.append(f"⏱ {metadata['prep_time']}")
            if metadata['difficulty']:
                badges.append(f"📊 {metadata['difficulty']}")
            if metadata['ingredients_count'] > 0:
                badges.append(f"🥗 {metadata['ingredients_count']} מצרכים")
            if metadata['steps_count'] > 0:
                badges.append(f"👨‍🍳 {metadata['steps_count']} שלבים")

            badges_text = " | ".join(badges) if badges else ""

            # Simplified prompt - let the model have creative freedom
            # Only provide essential info and minimal style guidance
            if not metadata['is_formatted']:
                prompt_text = f"""Generate an image:

Create a beautiful, appetizing Hebrew recipe card for this recipe:

{recipe_content}

Style: Modern cookbook design, warm colors, clean layout.
The Hebrew text must be perfectly readable.
                """
            else:
                prompt_text = f"""Generate an image:

Create a beautiful, appetizing Hebrew recipe card.

Title: {metadata['title']}
{badges_text}

Style: Modern cookbook design, warm colors, clean layout.
The Hebrew text must be perfectly readable.
                """

            # Generate infographic using Gemini 3 Pro Image (Nano Banana Pro)
            # NOTE: This model requires a paid API plan (not available in free tier)
            # To use this model, you need to:
            # 1. Go to https://aistudio.google.com/
            # 2. Enable billing for your project
            # 3. The API key needs to be from a project with billing enabled
            response = client.models.generate_content(
                model="gemini-3-pro-image-preview",
                contents=prompt_text,
                config=types.GenerateContentConfig(
                    response_modalities=['IMAGE'],
                ),
            )

            # Extract the image from the response
            if response.parts:
                for part in response.parts:
                    # Use inline_data directly (most reliable method)
                    if hasattr(part, 'inline_data') and part.inline_data:
                        image_bytes = part.inline_data.data
                        return base64.b64encode(image_bytes).decode("utf-8")

            raise Exception("No image generated in response")

        except Exception as e:
            print(f"Infographic generation error: {str(e)}")
            raise

    @classmethod
    def optimize_recipe_steps(cls, recipe_text):
        """
        Analyze recipe steps and return optimized sequence using AI

        Args:
            recipe_text (str): Raw recipe text to analyze

        Returns:
            dict: Optimized recipe information with parallel steps
        """
        try:
            system_instruction = """
            נתח את שלבי המתכון וייעל אותם על ידי:
            1. זיהוי שלבים שלוקחים זמן ויכולים להתבצע במקביל לשלבים אחרים
            2. הצעת סדר פעולות אופטימלי
            3. קיבוץ שלבים שניתן לבצע בו-זמנית
            4. הדגשת שלבי הכנה שניתן לבצע מראש

            הנחיות לחישוב זמנים:
            1. השתמש בזמן ההכנה המצוין במתכון המקורי בתור total_sequential_time
            2. אם לא מצוין זמן הכנה במתכון, חשב את הזמן המקורי כסכום של כל הפעולות
            3. חשב את הזמן המיועל (total_optimized_time) כזמן הארוך ביותר שנדרש כשמבצעים פעולות במקביל
            4. חשב את החיסכון בזמן (time_saved) כהפרש בין הזמן המקורי לזמן המיועל
            5. וודא שהחיסכון בזמן תמיד חיובי או 0 (אם אין אפשרות לייעול)

            החזר את הניתוח בפורמט JSON הבא בדיוק:
            {
                "optimized_steps": [
                    {
                        "step_group": "שם הקבוצה",
                        "parallel_steps": [
                            {
                                "description": "תיאור הצעד",
                                "estimated_time": "זמן משוער בדקות",
                                "dependencies": ["תלויות בצעדים קודמים"]
                            }
                        ]
                    }
                ],
                "prep_ahead_steps": [
                    {
                        "description": "צעד שניתן להכין מראש",
                        "max_prep_time": "זמן מקסימלי מראש בשעות"
                    }
                ],
                "total_optimized_time": "זמן כולל אחרי ייעול בדקות",
                "total_sequential_time": "זמן כולל ללא ייעול בדקות",
                "time_saved": "זמן שנחסך בדקות"
            }

            חשוב מאוד:
            1. החזר JSON תקין בלבד, ללא טקסט נוסף לפני או אחרי
            2. וודא שכל המערכים מאותחלים (לפחות ריקים)
            3. השתמש במספרים בלבד (ללא טקסט) בשדות של זמנים
            4. שמור על תלויות הגיוניות בין השלבים
            5. התייחס לאיכות האוכל ובטיחות המזון בהמלצות
            6. אל תשנה את שמות השדות או את המבנה של ה-JSON
            7. אל תוסיף הערות או הסברים - רק JSON
            """

            # Use new SDK
            client = genai.Client(api_key=current_app.config["GOOGLE_API_KEY"])

            # Generate response
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=recipe_text,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction
                )
            )
            response_text = response.text.strip()
            
            # Clean the response text from markdown code blocks
            if response_text.startswith('```json'):
                response_text = response_text[7:]  # Remove ```json prefix
            if response_text.startswith('```'):
                response_text = response_text[3:]  # Remove ``` prefix
            if response_text.endswith('```'):
                response_text = response_text[:-3]  # Remove ``` suffix
            
            response_text = response_text.strip()
            
            # Try to parse the response as JSON
            try:
                parsed_steps = json.loads(response_text)
                
                # Validate structure
                if not isinstance(parsed_steps, dict):
                    raise ValueError("Response must be a JSON object")
                
                required_fields = ["optimized_steps", "prep_ahead_steps", "total_optimized_time", 
                                 "total_sequential_time", "time_saved"]
                for field in required_fields:
                    if field not in parsed_steps:
                        raise ValueError(f"Missing required field: {field}")
                
                if not isinstance(parsed_steps["optimized_steps"], list):
                    raise ValueError("optimized_steps must be an array")
                
                if not isinstance(parsed_steps["prep_ahead_steps"], list):
                    raise ValueError("prep_ahead_steps must be an array")
                
                # Convert string times to integers if needed
                for field in ["total_optimized_time", "total_sequential_time", "time_saved"]:
                    if isinstance(parsed_steps[field], str):
                        parsed_steps[field] = int(''.join(filter(str.isdigit, parsed_steps[field])))
                
                return parsed_steps
                
            except json.JSONDecodeError as e:
                print(f"Invalid JSON from AI: {response_text}")
                raise ValueError("AI response is not valid JSON")
            except Exception as e:
                print(f"Validation error: {str(e)}")
                raise ValueError(f"Invalid response structure: {str(e)}")

        except Exception as e:
            print(f"Recipe step optimization error: {str(e)}")
            raise
