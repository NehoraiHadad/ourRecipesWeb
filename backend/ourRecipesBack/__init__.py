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



from .models import Recipe, SyncLog
from .extensions import db


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

    @app.route("/api/search")
    @jwt_required()
    async def search():
        query = request.args.get("query")
        if not query:
            return jsonify({})

        # Search in local database first
        local_recipes = Recipe.query.filter(
            (Recipe.raw_content.ilike(f"%{query}%"))
            | (Recipe.title.ilike(f"%{query}%"))
        ).all()

        recipes_dict = {}
        
        # Add local results to dict
        for recipe in local_recipes:
            recipes_dict[recipe.telegram_id] = {
                "id": recipe.telegram_id,
                "title": recipe.title,
                "details": recipe.raw_content,
                "image": recipe.image["data"] if recipe.image else None,
            }

        return jsonify({"results": recipes_dict})

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
                                    new_recipe = Recipe(
                                        telegram_id=telegram_id,
                                        title=recipe_data["title"],
                                        raw_content=message.text,  # Store the full message text
                                    )
                                    # Set image using the set_image method
                                    if recipe_data.get("image"):
                                        # Convert base64 image to binary
                                        image_data = base64.b64decode(recipe_data["image"].split(",")[1])
                                        new_recipe.set_image(image_data=image_data)
                                    
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

        prompt = """המטרה: לארגן את המתכון הבא לפורמט ברור ומסודר שיכלול שלושה חלקים עיקריים: כותרת, רשימת מצרכים והוראות הכנה. הפורמט צריך להיות קבוע וחזרתי כדי שיהיה נוח לקרוא בטלגרם ולהציג באפליקציה. השתמש בפיסוק ברור ובעברית תקנית. אל תשנה או תוסיף תוכן כמו רכיבים או כמויות או פעולות לביצוע - המטרה לארגן. אם יש רכיב או פעולה שאינך מבין החזר אותו כמו שהוא.

דוגמה למתכון לפני העיבוד:
"עוגת שוקולד פשוטה ומהירה: לקחת 2 ביצים, 1 כוס סוכר, 1 כוס קמח, חצי כוס שמן, חצי חבילה של שוקולד, וחצי שקית אבקת אפייה. לערבב הכל יחד ולאפות בתנור שחומם מראש ל-180 מעלות עד שהעוגה מוכנה."

דוגמה למתכון אחרי העיבוד:

כותרת: עוגת שוקולד פשוטה ומהירה
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

שים לב - ללא עיצוב טקסט והתשובה שלך מדוייקת ללא תוספות או שינויים
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
        data = request.get_json()
        print("Received data:", data, flush=True)
        message_id = int(data.get("messageId"))
        new_text = data.get("newText")
        image_data = data.get("image")
        client = TelegramClient(
            app.config["SESSION_NAME"], app.config["BOT_ID"], app.config["API_HASH"]
        )

        try:
            async with client:
                channel_entity = await client.get_entity(app.config["CHANNEL_URL"])
                message = await client.get_messages(channel_entity, ids=message_id)
                print("Existing message:", message, flush=True)
                if message:
                    try:
                        if image_data:
                            print(
                                "Image data received, length:",
                                len(image_data),
                                flush=True,
                            )
                            try:
                                # Convert base64 image to bytes
                                image_parts = image_data.split(",")
                                if len(image_parts) > 1:
                                    image_bytes = base64.b64decode(image_parts[1])
                                else:
                                    image_bytes = base64.b64decode(image_data)

                                # Send the image as a file to enable Telegram's built-in compression
                                file = BytesIO(image_bytes)
                                file.name = "image.jpg"

                                # Edit message with new text and image as a file
                                await client.edit_message(
                                    channel_entity, message, new_text, file=file
                                )
                            except Exception as e:
                                print(f"Error processing image: {str(e)}", flush=True)
                                # If image processing fails, just update the text
                                await client.edit_message(
                                    channel_entity, message, new_text
                                )
                        else:
                            # Edit message with new text only
                            await client.edit_message(channel_entity, message, new_text)

                        return jsonify({"status": "message_updated"}), 200
                    except errors.MessageNotModifiedError as e:
                        print(f"MessageNotModifiedError: {str(e)}", flush=True)
                        try:
                            if image_data:
                                try:
                                    # Convert base64 image to bytes
                                    image_parts = image_data.split(",")
                                    if len(image_parts) > 1:
                                        image_bytes = base64.b64decode(image_parts[1])
                                    else:
                                        image_bytes = base64.b64decode(image_data)

                                    # Send the image as a file to enable Telegram's built-in compression
                                    file = BytesIO(image_bytes)
                                    file.name = "image.jpg"

                                    new_msg = await client.send_message(
                                        channel_entity, new_text, file=file
                                    )
                                except Exception as e:
                                    print(
                                        f"Error processing image for new message: {str(e)}",
                                        flush=True,
                                    )
                                    new_msg = await client.send_message(
                                        channel_entity, new_text
                                    )
                            else:
                                new_msg = await client.send_message(
                                    channel_entity, new_text
                                )

                            await client.delete_messages(channel_entity, [message_id])
                            return (
                                jsonify(
                                    {
                                        "status": "new_message_sent",
                                        "new_message_id": new_msg.id,
                                    }
                                ),
                                200,
                            )
                        except Exception as e:
                            print(f"Error sending new message: {str(e)}", flush=True)
                            return (
                                jsonify(
                                    {
                                        "error": "Failed to send new message or delete old one",
                                        "details": str(e),
                                    }
                                ),
                                500,
                            )
                else:
                    return jsonify({"error": "Message not found"}), 404
        except Exception as e:
            print(f"Unexpected error: {str(e)}", flush=True)
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
            התנהג כמו שף מקצועי שיודע להכין מתכונים ביתיים לפי דרישות שונות. הכן מתכונים שמתאימים לרכיבים שהמשתמש מספק (אם הוא מספק. אם לא - בחר רכיבים ביתיים בעצמך), ולפי סוג הארוחה (ארוחת בוקר, צהריים, ערב או חטיף), שקול גם אם המתכון צריך להיות מתאים לילדים, להכנה מהירה, או לבקשות נוספות שהמשתמש עשוי להציע.

            דוגמא לבקשת משתמש:

            יש לי את המרכיבים הבאים: עגבניות, בצל, פרג, וגבינה מלוחה. אני רוצה להכין ארוחת צהריים. המתכון צריך להיות מתאים להכנה מהירה. יש לך הצעה למתכון?

            דוגמא לתשובה - התשובה צריכה להיות בדיוק בפורמט שמופיע בדוגמא ללא עיצוב טקסט או תוספות:

            כותרת: סלט עבניות ובצל עם פרג
            רשימת מצרכים:
            - 3 עגבניות בינוניות
            - 1 בצל גדול
            - 100 גרם פרג
            - 50 גרם גבינה מלוחה
            - 2 כפות שמן זית
            - מלח ופלפל לפי הטעם
            הוראות הכנה:
            נחתוך את העגבניות והבצל לקוביות קטנות.
            נערבב בקערה את העגבניות, הבצל, הפרג והרזונה.
            נתבל בשמן זית, מח ופלפל ונערבב הכל יחד עד לקבלת טעם אחיד.
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

    # ... rest of your routes ...

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
