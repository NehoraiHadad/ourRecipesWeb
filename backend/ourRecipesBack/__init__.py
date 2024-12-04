from datetime import datetime
from datetime import timedelta
from datetime import timezone

import os

from telethon import TelegramClient, errors, events
import base64
from io import BytesIO
from tempfile import NamedTemporaryFile


from flask import Flask, request, jsonify, session
from flask_cors import CORS

import hashlib
import hmac

from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    get_jwt,
    jwt_required,
    get_jwt_identity,
    set_access_cookies,
)


import google.generativeai as genai
import os



from .models import Recipe, RecipeVersion, SyncLog, db, Category
from sqlalchemy import func
from sqlalchemy.exc import OperationalError
import time
from sqlalchemy import desc


def create_app(test_config=None):
    # create and configure the app.
    app = Flask(__name__, instance_relative_config=True)

    # Default configuration
    app.config.update(
        SESSION_NAME="connect_to_our_recipes_channel",
        BOT_ID=os.getenv("BOT_ID"),
        API_HASH=os.getenv("API_HASH"),
        CHANNEL_URL=os.getenv("CHANNEL_URL"),
        OLD_CHANNEL_URL=os.getenv("OLD_CHANNEL_URL"),
        ORIGIN_CORS=os.getenv("ORIGIN_CORS", "http://127.0.0.1"),
        SECRET_JWT=os.getenv("SECRET_JWT", "dev-secret"),
        SQLALCHEMY_DATABASE_URI=os.getenv("DATABASE_URL", "sqlite:///recipes.db"),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        JWT_TOKEN_LOCATION=["cookies"],
        JWT_COOKIE_SAMESITE="None",
        JWT_COOKIE_SECURE=True,
        JWT_COOKIE_CSRF_PROTECT=False,
        JWT_ACCESS_TOKEN_EXPIRES=timedelta(hours=1),
        JWT_ACCESS_COOKIE_NAME="access_token_cookie",
        JWT_COOKIE_DOMAIN=None,
        SESSION_COOKIE_SECURE=True,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="None",
        SQLALCHEMY_ENGINE_OPTIONS={
            'pool_pre_ping': True,
            'pool_recycle': 300,
            'connect_args': {
                'timeout': 15,  # SQLite busy timeout in seconds
                'check_same_thread': False
            }
        }
    )
    genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

    # Override with test config if provided
    app.config.from_mapping(
        SECRET_KEY="dev",
    )

    if test_config:
        app.config.update(test_config)

    # Setup CORS after config is ready
    CORS(
        app,
        supports_credentials=True,
        resources={
            r"/api/*": {
                "origins": (
                    app.config["ORIGIN_CORS"].split(",")
                    if isinstance(app.config["ORIGIN_CORS"], str)
                    else app.config["ORIGIN_CORS"]
                )
            }
        },
        allow_methods=["GET", "POST"],
    )

    # Initialize JWT
    jwt = JWTManager(app)

    # Initialize database
    db.init_app(app)

    # Create routes and event handlers
    if not test_config:
        # Regular app initialization
        client = TelegramClient(
            app.config["SESSION_NAME"], app.config["BOT_ID"], app.config["API_HASH"]
        )

        @client.on(events.NewMessage(chats=app.config["OLD_CHANNEL_URL"]))
        async def handle_new_message(event):
            # Check if the message has text
            if event.text:
                # new_text = await reformat_with_chatgpt(event.text)
                print(event.text)
            else:
                new_text = None

            # Check if the message has a photo
            if event.media:
                # Download the photo to a temporary path
                path = await event.download_media()
            else:
                path = None

            # Send the reformatted text and/or photo to the new channel
            await client.send_message(os.getenv("CHANNEL_URL"), new_text, file=path)

            # Clean up downloaded media file if it exists
            if path:
                os.remove(path)

    # Register routes
    async def fetch_recipes(client, query):
        channel_entity = await client.get_entity(app.config["CHANNEL_URL"])
        results = client.iter_messages(channel_entity, search=query)
        recipes_list = [message async for message in results]
        return recipes_list

    def get_first_line_of_recipe(recipe_text):
        first_line = recipe_text.split("\n", 1)[0]  # Split and take the first line
        return first_line.strip("*:")

    def get_details_of_recipe(recipe_text):
        other_lines = "\n".join(
            recipe_text.splitlines(True)[1:]
        )  # Split and take the the other lines
        return other_lines

    async def organize_recipes_dict(client, recipes_list: list):
        recipes_dict = {}
        
        for recipe in recipes_list:
            key = recipe.id
            recipes_dict[key] = {}
            recipes_dict[key]["id"] = key
            recipes_dict[key]["title"] = get_first_line_of_recipe(recipe_text=recipe.text)
            recipes_dict[key]["details"] = get_details_of_recipe(recipe_text=recipe.text)

            if recipe.media:
                media_bytes = BytesIO()
                await client.download_media(recipe.media, file=media_bytes)
                media_bytes.seek(0)
                base64_encoded_media = base64.b64encode(media_bytes.read()).decode("utf-8")
                recipes_dict[key]["image"] = f"data:image/jpeg;base64,{base64_encoded_media}"
        
        return recipes_dict

    @app.route("/api/search", methods=["GET"])
    @jwt_required()
    def search_recipes():
        query = request.args.get("query", "").strip()
        categories = request.args.get("categories", "").split(',') if request.args.get("categories") else []
        categories = [cat.strip() for cat in categories if cat.strip()]
        
        try:
            recipes_query = Recipe.query
            
            # Apply text search if query exists
            if query:
                search_pattern = f"%{query}%"
                recipes_query = recipes_query.filter(
                    db.or_(
                        Recipe.title.ilike(search_pattern),
                        Recipe.raw_content.ilike(search_pattern)
                    )
                )
            
            # Apply category filter if categories specified
            if categories:
                category_conditions = []
                for category in categories:
                    category_pattern = f"%קטגוריות:%{category}%"
                    category_conditions.append(Recipe.raw_content.ilike(category_pattern))
                recipes_query = recipes_query.filter(db.or_(*category_conditions))
            
            recipes = recipes_query.all()
            results = {}
            
            for recipe in recipes:
                results[str(recipe.telegram_id)] = {
                    "id": recipe.telegram_id,
                    "title": recipe.title,
                    "details": recipe.raw_content,
                    "image": recipe.get_image_url() if recipe.has_image() else None
                }
            
            return jsonify({"results": results}), 200
            
        except Exception as e:
            print(f"Search error: {str(e)}")
            return jsonify({"error": str(e)}), 500

    def parse_recipe_content(text: str):
        """Parse recipe text into structured data, supporting both old and new formats"""
        try:
            if not text:
                raise ValueError("Empty text")

            parts = text.split('\n')
            data = {
                'title': '',
                'categories': [],
                'ingredients': [],
                'instructions': ''
            }
            
            # First try to get title - supporting both formats
            first_line = parts[0].strip() if parts else ""
            if first_line.startswith('כותרת:'):
                data['title'] = first_line.replace('כותרת:', '').strip()
            else:
                # Old format - title might end with colon
                data['title'] = first_line.split(':', 1)[0].strip()
            
            # If we couldn't get a title, use the fallback
            if not data['title']:
                data['title'] = get_first_line_of_recipe(text)
                
            # Get the rest of the content
            remaining_text = get_details_of_recipe(text)
            
            # Try to parse structured format
            try:
                current_section = None
                for line in remaining_text.split('\n'):
                    line = line.strip()
                    if not line:
                        continue
                        
                    if line.startswith('קטגוריות:'):
                        categories = line.replace('קטגוריות:', '').split(',')
                        data['categories'] = [cat.strip() for cat in categories if cat.strip()]
                    elif line == 'רשימת מצרכים:':
                        current_section = 'ingredients'
                    elif line == 'הוראות הכנה:':
                        current_section = 'instructions'
                    elif current_section == 'ingredients' and line.startswith('-'):
                        data['ingredients'].append(line.lstrip('- '))
                    elif current_section == 'instructions':
                        if data['instructions']:
                            data['instructions'] += '\n'
                        data['instructions'] += line
                    elif line.startswith('-'):  # Handle ingredients without explicit section
                        data['ingredients'].append(line.lstrip('- '))
                    elif not current_section and not any(line.startswith(x) for x in ['כותרת:', 'קטגוריות:']):
                        # If we're not in any section and line doesn't start with known markers,
                        # treat it as instructions
                        if data['instructions']:
                            data['instructions'] += '\n'
                        data['instructions'] += line
            except Exception as parsing_error:
                print(f"Error parsing structured format: {str(parsing_error)}")
                # If structured parsing fails, store everything as instructions
                data['instructions'] = remaining_text
                
            return data
            
        except Exception as e:
            print(f"Error in parse_recipe_content: {str(e)}")
            # Always return valid data structure, even in case of error
            return {
                'title': get_first_line_of_recipe(text),
                'categories': [],
                'ingredients': [],
                'instructions': get_details_of_recipe(text)
            }

    # Update the Recipe creation/update logic
    async def create_or_update_recipe(telegram_id, message_text, image_data=None):
        """Create or update recipe with error handling and fallback"""
        try:
            if not message_text:
                raise ValueError("Empty message text")
                
            # Try to parse the content
            parsed_data = parse_recipe_content(message_text)
            
            # Create recipe with available data
            recipe = Recipe(
                telegram_id=telegram_id,
                title=parsed_data['title'] or get_first_line_of_recipe(message_text),
                raw_content=message_text
            )
            
            # Set structured data if available
            if parsed_data['ingredients']:
                recipe.ingredients = parsed_data['ingredients']
            if parsed_data['instructions']:
                recipe.instructions = parsed_data['instructions']
                
            # Handle image if provided
            if image_data:
                recipe.set_image(image_data=image_data)
                
            # Handle categories if available
            if parsed_data['categories']:
                for category_name in parsed_data['categories']:
                    try:
                        category = Category.get_or_create(category_name)
                        if category and category not in recipe.categories:
                            recipe.categories.append(category)
                    except Exception as cat_error:
                        print(f"Error handling category {category_name}: {str(cat_error)}")
                        
            return recipe
            
        except Exception as e:
            print(f"Error in create_or_update_recipe: {str(e)}")
            # Create basic recipe as fallback
            return Recipe(
                telegram_id=telegram_id,
                title=get_first_line_of_recipe(message_text),
                raw_content=message_text
            )

    @app.route("/api/search/telegram")
    @jwt_required()
    async def search_telegram():
        query = request.args.get("query")
        existing_ids = request.args.getlist("existing_ids[]")
        
        if not query:
            return jsonify({})

        try:
            client = TelegramClient(
                app.config["SESSION_NAME"], 
                app.config["BOT_ID"], 
                app.config["API_HASH"]
            )
            
            async with client:
                channel_entity = await client.get_entity(app.config["CHANNEL_URL"])
                recipes_list = await fetch_recipes(client, query)
                telegram_recipes = await organize_recipes_dict(client, recipes_list)
                
                new_results = {}
                for telegram_id, recipe_data in telegram_recipes.items():
                    if str(telegram_id) not in existing_ids:
                        new_results[telegram_id] = recipe_data
                        
                        # Get the full message text for syncing
                        message = await client.get_messages(channel_entity, ids=telegram_id)
                        if message and message.text:
                            try:
                                existing_recipe = Recipe.query.filter_by(telegram_id=telegram_id).first()
                                if not existing_recipe:
                                    if recipe_data.get("image"):
                                        image_data = base64.b64decode(recipe_data["image"].split(',')[1])
                                    else:
                                        image_data = None
                                    new_recipe = await create_or_update_recipe(
                                        telegram_id=telegram_id,
                                        message_text=message.text,
                                        image_data=image_data 
                                    )
                                    if new_recipe:
                                        db.session.add(new_recipe)
                                        print(f"Added new recipe {telegram_id} to DB", flush=True)
                            except Exception as e:
                                print(f"Error syncing recipe {telegram_id}: {str(e)}", flush=True)
                
                try:
                    db.session.commit()
                    print(f"Committed {len(new_results)} new recipes to DB", flush=True)
                except Exception as e:
                    db.session.rollback()
                    print(f"Error committing recipes: {str(e)}", flush=True)

                return jsonify({"results": new_results})

        except Exception as e:
            print(f"Error searching Telegram: {str(e)}", flush=True)
            return jsonify({"error": str(e)}), 500

    @app.route("/api/login", methods=["POST"])
    async def login():
        user_data = request.json
        print(user_data, flush=True)
        user_id = user_data.get("id")
        user_id = str(user_id)

        if not verify_telegram_login(user_data):
            return jsonify({"error": "Authentication failed"}), 401

        # Session management
        session["user_id"] = user_id

        print(f"User ID {user_id} authenticated.", flush=True)

        access_token = create_access_token(identity=user_id)
        response = jsonify({"login": True})
        set_access_cookies(response, access_token)
        return response

    @app.route("/api/validate_session", methods=["GET"])
    @jwt_required()
    async def validate_session():
        current_user = get_jwt_identity()
        user_id = session.get("user_id")
        user_id = str(user_id)
        print("current_user: " + str(current_user), flush=True)
        print("session userId: " + str(user_id), flush=True)
        if user_id == "guest":
            session["edit_permission"] = False
            app.logger.info(f"Session valid for user_id: {user_id}")
            return (
                jsonify({"authenticated": True, "canEdit": False, "user_id": user_id}),
                200,
            )
        elif user_id == current_user:
            permission = await check_user_edit_permission(user_id, app.config["OLD_CHANNEL_URL"])
            session["edit_permission"] = permission
            app.logger.info(f"Session valid for user_id: {user_id} with edit permission: {permission}")
            return (
                jsonify(
                    {"authenticated": True, "canEdit": permission, "user_id": user_id}
                ),
                200,
            )
        else:
            app.logger.warning("Session validation failed.")
            return jsonify({"authenticated": False, "can_edit": False}), 401

    @app.route("/api/login_guest", methods=["POST"])
    def login_guest():
        # Generate a token for a guest user
        guest_user = "guest"
        session["user_id"] = guest_user

        access_token = create_access_token(identity=guest_user)
        response = jsonify({"login": True})
        set_access_cookies(response, access_token)
        return response

    @app.route("/api/logout", methods=["GET"])
    def logout():
        session.pop("user_id", None)

        response = jsonify({"logout": True})
        return response

    @app.after_request
    def refresh_expiring_jwts(response):
        try:
            exp_timestamp = get_jwt()["exp"]
            now = datetime.now(timezone.utc)
            target_timestamp = datetime.timestamp(now + timedelta(minutes=30))
            if target_timestamp > exp_timestamp:
                access_token = create_access_token(identity=get_jwt_identity())
                set_access_cookies(response, access_token)
            return response
        except (RuntimeError, KeyError):
            # Case where there is not a valid JWT. Just return the original response
            return response

    def verify_telegram_login(auth_data):
        auth_data = request.json
        check_hash = auth_data.pop("hash")

        BOT_TOKEN = os.getenv("BOT_TOKEN")

        # Create the data check string
        data_check_string = "\n".join(
            f"{key}={value}" for key, value in sorted(auth_data.items())
        )

        # Create a secret key from the bot token (take the SHA-256 hash of the bot token and use it as the secret key)
        secret_key = hashlib.sha256(BOT_TOKEN.encode()).digest()

        # Calculate HMAC SHA-256 hash of the data check string using the secret key
        hmac_hash = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256
        ).hexdigest()

        # Verify if the calculated hash matches the received hash
        if hmac_hash == check_hash:
            # The data is from Telegram.
            return True
        else:
            # The data is NOT from Telegram, respond accordingly
            return False

    async def check_user_edit_permission(user_id, channel_url):
        client = TelegramClient(
            app.config["SESSION_NAME"], app.config["BOT_ID"], app.config["API_HASH"]
        )
        async with client:
            channel_entity = await client.get_entity(channel_url)
            try:
                # Fetch the user's permissions in the channel
                permissions = await client.get_permissions(channel_entity, int(user_id))

                # Check if the user has the right to edit messages
                if permissions.is_admin and permissions.edit_messages:
                    print(f"User {user_id} can edit messages in the channel.")
                    return True
                else:
                    print(f"User {user_id} cannot edit messages in the channel.")
                    return False
            except Exception as e:
                print(f"Failed to check permissions: {str(e)}")
                return False

    @app.route("/api/reformat_recipe", methods=["POST"])
    @jwt_required()
    def reformat_recipe():
        data = request.get_json()
        if "text" not in data:
            return jsonify({"error": "Missing text"}), 400

        prompt = """המטרה: לארגן את המתכו�� הבא לפורמט ברור ומסודר שיכלול ארבעה חלקים עיקריים: כותרת, קטגוריות, רשימת מצרכים והוראות הכנה. הפורמט צריך להיות קבוע וחזרתי כדי שיהיה נוח לקרוא בטלגרם ולהציג באפליקציה. השתמש בפיסוק ברור ובעברית תקנית. אל תשנה או תוסיף תוכן כמו רכיבים או כמויות או פעולות לביצוע - המטרה לארגן. אם יש רכיב או פעולה שאינך מבין החזר אותו כמו שהוא.

דוגמה למתכון לפני עיבוד:
"עוגת שוקולד פשוטה ומהירה: לקחת 2 ביצים, 1 כוס סוכר, 1 כוס קמח, חצי כוס שמן, חצי חבילה של שוקולד, וחצי שקית אבקת אפייה. לערבב הכל יחד ולאפות בתנור שחומם מראש ל-180 מעלות עד שהעוגה מוכנה."

דוגמה למתכון אחרי העיבוד:

כותרת: עוגת שוקולד פשוטה ומהירה
קטגוריות: עוגות, מאפים מתוקים, קינוחים
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

שים לב - ללא עיצוב טקסט והתשובה שלך מדוייקת ללא תוספות או שינויים. הקטגוריות צריכות להיות מופרדות בסיקים.
"""

        try:
            model = genai.GenerativeModel(
                model_name="gemini-1.5-flash", system_instruction=prompt
            )
            response = model.generate_content(data["text"])

            return ({"reformatted_text": response.text}), 200
        except Exception as e:
            print(e)
            return jsonify({"error": str(e)}), 500

    @app.route("/api/update_recipe", methods=["POST"])
    @jwt_required()
    async def update_recipe():
        try:
            data = request.get_json()
            message_id = data.get("messageId")
            new_text = data.get("newText")
            image = data.get("image")
            
            if not message_id or not new_text:
                return jsonify({"error": "Missing required fields"}), 400
            
            # Get recipe from database
            recipe = Recipe.query.filter_by(telegram_id=message_id).first()
            if not recipe:
                return jsonify({"error": "Recipe not found"}), 404
            
            # Convert base64 image if exists
            image_bytes = None
            if image and isinstance(image, str) and image.startswith('data:image'):
                try:
                    image_format, image_string = image.split(';base64,')
                    image_bytes = base64.b64decode(image_string)
                except Exception as e:
                    print(f"Error processing image: {str(e)}")
                    return jsonify({"error": "Invalid image format"}), 400

            # Update recipe content with versioning
            recipe.update_content(
                title=get_first_line_of_recipe(new_text),
                raw_content=new_text,
                image_data=image_bytes,
                created_by=get_jwt_identity(),
                change_description="עדכון מתכון"
            )

            # Try to update in Telegram
            client = TelegramClient(
                app.config["SESSION_NAME"], 
                app.config["BOT_ID"], 
                app.config["API_HASH"]
            )

            async with client:
                channel_entity = await client.get_entity(app.config["CHANNEL_URL"])
                message = await client.get_messages(channel_entity, ids=message_id)
                
                if message:
                    try:
                        if image_bytes:
                            file = BytesIO(image_bytes)
                            file.name = "image.jpg"
                            await client.edit_message(
                                channel_entity, message, new_text, file=file
                            )
                        else:
                            await client.edit_message(channel_entity, message, new_text)

                        # If Telegram update successful, commit DB changes
                        db.session.commit()
                        
                        # Return updated categories in response
                        updated_categories = [cat.name for cat in recipe.categories] if recipe.categories else []
                        return jsonify({
                            "status": "message_updated",
                            "categories": updated_categories
                        }), 200

                    except Exception as e:
                        db.session.rollback()
                        print(f"Error updating message: {str(e)}")
                        return jsonify({"error": str(e)}), 500
                else:
                    return jsonify({"error": "Message not found in Telegram"}), 404

        except Exception as e:
            db.session.rollback()
            print(f"Error in update_recipe: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/send_recipe", methods=["POST"])
    @jwt_required()
    async def send_recipe():
        data = request.get_json()

        new_text = data.get("newText")
        image = data.get("image")
        if not new_text:
            return jsonify({"error": "No text provided"}), 400

        client = TelegramClient(
            app.config["SESSION_NAME"], app.config["BOT_ID"], app.config["API_HASH"]
        )

        try:
            async with client:
                channel_entity = await client.get_entity(app.config["CHANNEL_URL"])
                if image:
                    image_bytes = base64.b64decode(image)
                    with NamedTemporaryFile(delete=False, suffix=".jpg") as temp_image:
                        temp_image.write(image_bytes)
                        temp_image.flush()
                        # Send message with photo
                        new_msg = await client.send_message(
                            channel_entity, new_text, file=temp_image.name
                        )

                    return (
                        jsonify({"status": "message_sent", "message_id": new_msg.id}),
                        200,
                    )
                else:
                    new_msg = await client.send_message(channel_entity, new_text)
                    print(f"Message sent with ID: {new_msg.id}", flush=True)
                    return (
                        jsonify({"status": "message_sent", "message_id": new_msg.id}),
                        200,
                    )
        except Exception as e:
            print(f"Failed to send message: {str(e)}", flush=True)
            return jsonify({"error": str(e)}), 500

    @app.route("/api/meal-suggestions", methods=["POST"])
    @jwt_required()
    def handle_meal_suggestion():
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        try:
            prompt = """
            התנהג כמו שף מקצועי שיודע להכין מתכונים ביתיים לי דרישות שונות. הכן מתכונים שמתאימים לרכיבים שהמשתמש מספק (אם הוא מספק. אם לא - בחר רכיבים ביים בעצמך), ולפי סוג הארוחה (ארוחת בוקר, צהריים, ערב או חטיף), שקול גם אם המתכון צריך להיות מתאים לילדים, להכנה מהירה, או לבקשות נוספות שהמשתמש עשוי להציע.

            דוגמא לבקשת משתמש:

            יש לי את המרכיבים הבאים: עגבניות, בצל, פרג, וגבינה מלוחה. אני רוצה להכין ארוחת צהריים. המתכון צריך להיות מתאים להכנה מהירה. יש לך הצעה למתכון?

            דוגמא לתשובה - התשובה צריכה להיות בדיוק בפורמט שמופיע דוגמא ללא עיצוב טקסט או תוספות:

            כותרת: סלט עגבניות ובצל עם פרג
            קטגוריות: סלטים, מנות צמחוניות, מנות מהירות
            רשימת מצרכים:
            - 3 עגבניות בינוניות
            - 1 בצל גדול
            - 100 גרם פרג
            - 50 גרם גבינה מלוחה
            - 2 כפות שמן זית
            - מלח ופלפל לפי הטעם
            הוראות הכנה:
            נחתוך את העגבניות והבצל לקוביות קטנות.
            נערבב בקערה את העגבניות, הבצל, הפרג והגבינה המלוחה.
            נתבל בשמן זית, מלח ופלפל ונערבב הכל יחד עד לקבלת טעם אחיד.

            שים לב שהקטגוריות צריכות להיות מופרדות בפסיקים ולשקף את סוג המנה, סגנון הבישול, והתאמות מיוחדות (כמו צמחוני, טבעוני, ללא גלוטן וכו').
            """
            # 'ingredients': '', 'mealType': [], 'quickPrep': False, 'childFriendly': False, 'additionalRequests': '', 'photo': False
            user_prompt = f" {'יש לי את המרכיבים הבאים: ' + data["ingredients"] if data["ingredients"] else ""}. אני רוצה להכין {data["mealType"]}.{"המתכון צריך להיות מתאים להכנה מהירה." if data["quickPrep"] else ""}{"המתכון צריך להיות מותאם לילדים." if data["childFriendly"] else ""}{"בנוסף התייחס לזה: "+ data["additionalRequests"] if data["additionalRequests"] else ""} יש לך הצעה למתכון?"

            model = genai.GenerativeModel(
                model_name="gemini-1.5-flash", system_instruction=prompt
            )
            response = model.generate_content(user_prompt)

            return ({"status": "success", "message": response.text}), 200

        except Exception as e:
            print(e)
            return jsonify({"error": str(e)}), 500

    @app.route("/api/generate-image", methods=["POST"])
    @jwt_required()
    def generate_image():
        data = request.get_json()
        recipe_data = data["recipeContent"]

        # שלב מקדים: קבלת פרומפט מותאם ממודל שפה
        try:
            prompt_for_image = f"""
            עליך ליצור פרומפט באנגלית לתמונה עבור המתכון הבא: {recipe_data}. 
            תן לי פרומפט מפורט שיתאר את התמונה המושלמת עבור המנה הזו.
            """

            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt_for_image)

            API_URL = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev"
            headers = {"Authorization": os.getenv("HF_TOKEN")}

            import requests

            payload = {
                "inputs": response.text,
            }
            response = requests.post(API_URL, headers=headers, json=payload)

            if response.status_code != 200:
                raise Exception(
                    f"Request failed with status code {response.status_code}: {response.text}"
                )

            image_bytes = response.content

            # Convert image bytes to base64
            response_photo = base64.b64encode(image_bytes).decode("utf-8")

            return jsonify({"status": "success", "image": response_photo}), 200

        except Exception as e:
            print(e, flush=True)
            return jsonify({"error": str(e)}), 500

    @app.route("/ping")
    def ping():
        return "Pong!", 200

    @app.route("/api/sync", methods=["POST"])
    @jwt_required()
    async def sync_recipes():
        user_id = get_jwt_identity()
        if user_id == "guest":
            return jsonify({"error": "Unauthorized"}), 403

        try:
            sync_log = SyncLog(sync_type="full")
            db.session.add(sync_log)
            db.session.commit()

            client = TelegramClient(
                app.config["SESSION_NAME"], 
                app.config["BOT_ID"], 
                app.config["API_HASH"]
            )
            
            async with client:
                channel_entity = await client.get_entity(app.config["CHANNEL_URL"])
                messages = await client.get_messages(channel_entity, limit=None)  # Get all messages
                
                for message in messages:
                    try:
                        existing_recipe = Recipe.query.filter_by(telegram_id=message.id).first()
                        
                        if existing_recipe:
                            # Update existing recipe
                            existing_recipe.title = get_first_line_of_recipe(message.text)
                            existing_recipe.raw_content = get_details_of_recipe(message.text)
                            if message.media:
                                media_bytes = BytesIO()
                                await client.download_media(message.media, file=media_bytes)
                                media_bytes.seek(0)
                                existing_recipe.set_image(image_data=media_bytes.read())
                            sync_log.recipes_updated += 1
                        else:
                            # Create new recipe
                            new_recipe = Recipe(
                                telegram_id=message.id,
                                title=get_first_line_of_recipe(message.text),
                                raw_content=get_details_of_recipe(message.text)
                            )
                            if message.media:
                                media_bytes = BytesIO()
                                await client.download_media(message.media, file=media_bytes)
                                media_bytes.seek(0)
                                new_recipe.set_image(image_data=media_bytes.read())
                            db.session.add(new_recipe)
                            sync_log.recipes_added += 1
                        
                        sync_log.recipes_processed += 1
                        
                    except Exception as e:
                        sync_log.recipes_failed += 1
                        print(f"Error processing message {message.id}: {str(e)}")
                        
                db.session.commit()
                sync_log.status = "completed"
                sync_log.completed_at = datetime.now(timezone.utc)
                db.session.commit()
                
                return jsonify({
                    "status": "success",
                    "processed": sync_log.recipes_processed,
                    "added": sync_log.recipes_added,
                    "updated": sync_log.recipes_updated,
                    "failed": sync_log.recipes_failed
                }), 200

        except Exception as e:
            if sync_log:
                sync_log.status = "failed"
                sync_log.completed_at = datetime.now(timezone.utc)
                sync_log.error_message = str(e)
                db.session.commit()
            return jsonify({"status": "error", "message": str(e)}), 500

    @app.route("/api/categories", methods=["GET"])
    @jwt_required()
    def get_categories():
        try:
            # Get all active categories, ordered by name
            categories = Category.query.filter_by(is_active=True).order_by(Category.name).all()
            print(f"Found {len(categories)} categories in DB")
            
            # Return just the category names for now
            categories_list = [category.name for category in categories]
            print(f"Categories list: {categories_list}")
            return jsonify(categories_list), 200

        except Exception as e:
            print(f"Error fetching categories: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/categories/sync", methods=["POST"])
    @jwt_required()
    def sync_categories():
        try:
            # Check if user has edit permissions
            current_user = get_jwt_identity()
            if current_user == "guest" or not session.get("edit_permission"):
                return jsonify({"error": "Unauthorized"}), 403

            # Sync categories from recipes
            success = Category.sync_categories_from_recipes()
            
            if success:
                return jsonify({"message": "Categories synced successfully"}), 200
            else:
                return jsonify({"error": "Failed to sync categories"}), 500

        except Exception as e:
            print(f"Error in sync_categories: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/categories/status", methods=["GET"])
    @jwt_required()
    def get_categories_status():
        try:
            total_categories = Category.query.count()
            active_categories = Category.query.filter_by(is_active=True).count()
            
            # Get sample of categories
            sample_categories = Category.query.limit(5).all()
            sample_names = [cat.name for cat in sample_categories]
            
            return jsonify({
                "total_count": total_categories,
                "active_count": active_categories,
                "sample_categories": sample_names
            }), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/categories/init", methods=["POST"])
    @jwt_required()
    def initialize_categories():
        try:
            # Check if categories exist
            if Category.query.count() == 0:
                # Extract categories from existing recipes
                recipes = Recipe.query.all()
                categories_set = set()
                
                for recipe in recipes:
                    if recipe.raw_content:
                        recipe_parts = recipe.raw_content.split('\n')
                        for part in recipe_parts:
                            if part.strip().startswith('קטגוריות:'):
                                categories = part.replace('קטגוריות:', '').split(',')
                                categories_set.update(cat.strip() for cat in categories if cat.strip())
                
                # Create categories
                for category_name in categories_set:
                    category = Category(name=category_name, is_active=True)
                    db.session.add(category)
                
                db.session.commit()
                return jsonify({"message": f"Initialized {len(categories_set)} categories"}), 200
            else:
                return jsonify({"message": "Categories already exist"}), 200
                
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recipes/<int:recipe_id>/versions", methods=["GET", "POST"])
    @jwt_required()
    def recipe_versions(recipe_id):
        try:
            recipe = Recipe.query.filter_by(telegram_id=recipe_id).first()
            if not recipe:
                return jsonify({"error": "Recipe not found"}), 404

            if request.method == "POST":
                data = request.get_json()
                content = data.get('content')
                change_description = data.get('change_description')
                
                # Clean up old versions
                recipe.cleanup_versions()
                
                # Create new version
                new_version = RecipeVersion(
                    recipe_id=recipe.id,
                    content=content,
                    created_by=get_jwt_identity(),
                    change_description=change_description
                )
                
                # Update current version status
                current_version = RecipeVersion.query.filter_by(recipe_id=recipe.id, is_current=True).first()
                if current_version:
                    current_version.is_current = False
                new_version.is_current = True
                
                db.session.add(new_version)
                db.session.commit()
                
                # Return all versions
                versions = RecipeVersion.query.filter_by(recipe_id=recipe.id).order_by(RecipeVersion.version_num.desc()).all()
                return jsonify([version.to_dict() for version in versions]), 200
                
            else:  # GET
                # Clean up old versions before returning
                recipe.cleanup_versions()
                db.session.commit()
                
                # Return all versions (should be max 3 now)
                versions = RecipeVersion.query.filter_by(recipe_id=recipe.id).order_by(RecipeVersion.version_num.desc()).all()
                return jsonify([version.to_dict() for version in versions]), 200
                
        except Exception as e:
            print(f"Error handling versions: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recipes/<int:recipe_id>/versions/<int:version_id>/restore", methods=["POST"])
    @jwt_required()
    async def restore_recipe_version(recipe_id, version_id):
        """Restore a previous version of a recipe"""
        try:
            # First get the recipe by telegram_id
            recipe = Recipe.query.filter_by(telegram_id=recipe_id).first()
            if not recipe:
                return jsonify({"error": "Recipe not found"}), 404

            version = db.session.get(RecipeVersion, version_id)
            if not version or version.recipe_id != recipe.id:
                return jsonify({"error": "Version not found"}), 404
            
            # בדיקה אם התוכן זהה
            if (version.content['raw_content'] == recipe.raw_content and 
                version.image_data == recipe.image_data):
                return jsonify({
                    "message": "No changes needed - content is identical",
                    "recipe": {
                        "id": recipe.id,
                        "title": recipe.title,
                        "raw_content": recipe.raw_content,
                        "ingredients": recipe.ingredients if hasattr(recipe, 'ingredients') else None,
                        "instructions": recipe.instructions if hasattr(recipe, 'instructions') else None,
                        "image": recipe.get_image_url(),
                        "categories": [cat.name for cat in recipe.categories] if recipe.categories else []
                    }
                }), 200
            
            # Create description for the restore action
            restore_description = f"שחזור לגרסה {version.version_num}"
            
            # Update recipe with version content
            recipe.update_content(
                title=version.content['title'],
                raw_content=version.content['raw_content'],
                image_data=version.image_data,
                created_by=get_jwt_identity(),
                change_description=restore_description
            )
            
            # Update Telegram message only if not in testing mode
            if not app.config.get('TESTING'):
                try:
                    client = TelegramClient(
                        app.config["SESSION_NAME"], 
                        app.config["BOT_ID"], 
                        app.config["API_HASH"]
                    )
                    
                    async with client:
                        channel_entity = await client.get_entity(app.config["CHANNEL_URL"])
                        message = await client.get_messages(channel_entity, ids=recipe.telegram_id)
                        
                        if message:
                            if version.image_data:
                                file = BytesIO(version.image_data)
                                file.name = "image.jpg"
                                await client.edit_message(
                                    channel_entity,
                                    message,
                                    version.content['raw_content'],
                                    file=file
                                )
                            else:
                                await client.edit_message(
                                    channel_entity,
                                    message,
                                    version.content['raw_content']
                                )
                except errors.MessageNotModifiedError:
                    # אם התוכן זהה, נתעלם מהשגיאה ונחזיר הצלחה
                    pass
                    
            db.session.commit()
            return jsonify({
                "message": "Version restored successfully",
                "recipe": {
                    "id": recipe.id,
                    "title": recipe.title,
                    "raw_content": recipe.raw_content,
                    "ingredients": recipe.ingredients if hasattr(recipe, 'ingredients') else None,
                    "instructions": recipe.instructions if hasattr(recipe, 'instructions') else None,
                    "image": recipe.get_image_url(),
                    "categories": [cat.name for cat in recipe.categories] if recipe.categories else []
                }
            }), 200
            
        except Exception as e:
            db.session.rollback()
            print(f"Error restoring version: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/recipes/<int:recipe_id>/versions/compare", methods=["POST"])
    @jwt_required()
    def compare_versions():
        """Compare two versions of a recipe"""
        try:
            data = request.get_json()
            version1_id = data.get('version1_id')
            version2_id = data.get('version2_id')
            
            if not version1_id or not version2_id:
                return jsonify({"error": "Missing version IDs"}), 400
            
            version1 = RecipeVersion.query.get(version1_id)
            version2 = RecipeVersion.query.get(version2_id)
            
            if not version1 or not version2:
                return jsonify({"error": "Version not found"}), 404
            
            # Compare the versions
            comparison = {
                'title_changed': version1.content['title'] != version2.content['title'],
                'content_changed': version1.content['raw_content'] != version2.content['raw_content'],
                'categories_changed': version1.content['categories'] != version2.content['categories'],
                'ingredients_changed': version1.content['ingredients'] != version2.content['ingredients'],
                'instructions_changed': version1.content['instructions'] != version2.content['instructions'],
                'image_changed': bool(version1.image_data) != bool(version2.image_data)
            }
            
            return jsonify(comparison), 200
            
        except Exception as e:
            print(f"Error comparing versions: {str(e)}")
            return jsonify({"error": str(e)}), 500

    # Error handlers
    @jwt.invalid_token_loader
    def invalid_token_callback(error_string):
        print(error_string, flush=True)
        return jsonify({"authenticated": False, "message": "Invalid token"}), 401

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_data):
        print(jwt_header, jwt_data, flush=True)
        return jsonify({"authenticated": False, "message": "Token has expired"}), 401

    # Create database tables
    with app.app_context():
        db.create_all()

    return app  # Make sure to return the app
