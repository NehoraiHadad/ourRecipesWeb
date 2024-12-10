import google.generativeai as genai
from flask import current_app
import requests
import base64

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
        רשימת מצרכים:
        - [מצרך 1]
        - [מצרך 2]
        הוראות הכנה:
        [הוראות ההכנה]
        """

    @classmethod
    def generate_recipe_suggestion(cls, ingredients="", meal_type=None, quick_prep=False, 
                                 child_friendly=False, additional_requests=""):
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
                system_instruction=cls._get_recipe_prompt()
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
                API_URL,
                headers=headers,
                json={"inputs": prompt_response.text}
            )

            if response.status_code != 200:
                raise Exception(f"Image generation failed: {response.text}")

            # Convert response to base64
            image_bytes = response.content
            return base64.b64encode(image_bytes).decode("utf-8")

        except Exception as e:
            print(f"Image generation error: {str(e)}")
            raise 