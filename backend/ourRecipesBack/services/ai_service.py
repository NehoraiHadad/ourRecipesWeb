import google.generativeai as genai
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
            # Configure AI model
            genai.configure(api_key=current_app.config["GOOGLE_API_KEY"])
            model = genai.GenerativeModel(
                model_name="gemini-1.5-flash",
                system_instruction=cls._get_recipe_prompt(),
            )

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

            # Generate response
            response = model.generate_content(user_prompt)
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
            # First get image prompt from language model
            genai.configure(api_key=current_app.config["GOOGLE_API_KEY"])
            prompt_model = genai.GenerativeModel("gemini-1.5-flash")

            prompt_request = f"""
            Create a detailed English prompt for generating an image of this recipe: {recipe_content}. 
            The prompt should describe the perfect photo for this dish.
            Focus on the final dish appearance, plating, and food photography aspects.
            Keep the prompt under 100 words.
            """

            prompt_response = prompt_model.generate_content(prompt_request)

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
            prompt = """המטרה: לארגן את המתכון הבא לפורמט ברור ומסודר שיכלול שלושה חלקים עיקריים: כותרת, רשימת מצרכים והוראות הכנה. הפורמט צריך להיות קבוע וחזרתי כדי שיהיה נוח לקרוא בטלגרם ולהציג באפליקציה. השתמש בפיסוק ברור ובעברית תקנית. אל תשנה או תוסיף תוכן כמו רכיבים או כמויות או פעולות לביצוע - המטרה לארגן. אם יש רכיב או פעולה שאינך מבין החזר אותו כמו שהוא.

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

            # Configure AI model
            genai.configure(api_key=current_app.config["GOOGLE_API_KEY"])
            model = genai.GenerativeModel(
                model_name="gemini-1.5-flash", system_instruction=prompt
            )

            # Generate response
            response = model.generate_content(recipe_text)
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
            # Configure AI model
            genai.configure(api_key=current_app.config["GOOGLE_API_KEY"])
            model = genai.GenerativeModel(
                model_name="gemini-1.5-flash",
                system_instruction="""
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
            )

            # Build prompt
            prompt = f"""
            זהו המתכון המקורי:
            {recipe_text}
            
            בקשת השיפור של המשתמש:
            {refinement_request}
            
            אנא שפר את המתכון לפי הבקשה תוך שמירה על אותו פורמט בדיוק.
            """

            # Generate response
            response = model.generate_content(prompt)
            return response.text

        except Exception as e:
            print(f"Recipe refinement error: {str(e)}")
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
            # Configure AI model
            genai.configure(api_key=current_app.config["GOOGLE_API_KEY"])
            
            prompt = """
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
            
            model = genai.GenerativeModel(
                model_name="gemini-1.5-flash",
                system_instruction=prompt
            )

            # Generate response
            response = model.generate_content(recipe_text)
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
