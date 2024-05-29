from datetime import datetime
from datetime import timedelta
from datetime import timezone

import os

from telethon import TelegramClient, errors
import base64
from io import BytesIO

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

import openai


def create_app(test_config=None):

    # create and configure the app.
    app = Flask(__name__, instance_relative_config=True)
    CORS(
        app,
        supports_credentials=True,
        resources={r"/api/*": {"origins": "http://127.0.0.1"}},
    )

    jwt = JWTManager(app)
    # Configure the JWT secret key
    app.config["JWT_SECRET_KEY"] = os.getenv("SECRET_JWT")
    app.config["JWT_TOKEN_LOCATION"] = ["cookies"]
    app.config["JWT_COOKIE_SECURE"] = True
    app.config["JWT_COOKIE_CSRF_PROTECT"] = True
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = 3600  # 1 hour

    app.config["SESSION_COOKIE_SECURE"] = True
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

    openAiClient = openai.OpenAI()

    app.config.from_mapping(
        SECRET_KEY="dev", DATABASE=os.path.join(app.instance_path, "baba.sqlite")
    )

    if test_config is None:
        # load the instance config, if it exists, when not testing.
        app.config.from_pyfile("config.py", silent=True)
    else:
        # load the test config if passed in.
        app.config.from_mapping(test_config)

    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass

    bot_id = os.getenv("BOT_ID")
    api_hash = os.getenv("API_HASH")
    channel_url = os.getenv("CHANNEL_URL")
    session_name = "connect_to_our_recipes_channel"

    async def fetch_recipes(query):
        client = TelegramClient(session_name, bot_id, api_hash)
        async with client:
            channel_entity = await client.get_entity(channel_url)
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

    async def organize_recipes_dict(recipes_list: list):
        client = TelegramClient(session_name, bot_id, api_hash)
        recipes_dict = {}

        async with client:
            for recipe in recipes_list:
                key = recipe.id
                # recipes_dict[key] = {
                #     "id": str,
                #     "title": str,
                #     "details": str,
                #     "ingredients": [str],
                #     "image": str,
                #     "time": str,
                # }
                recipes_dict[key] = {}
                recipes_dict[key]["id"] = key
                recipes_dict[key]["title"] = get_first_line_of_recipe(
                    recipe_text=recipe.text
                )
                recipes_dict[key]["details"] = get_details_of_recipe(
                    recipe_text=recipe.text
                )

                if recipe.media:
                    media_bytes = BytesIO()
                    await client.download_media(recipe.media, file=media_bytes)
                    media_bytes.seek(0)

                    base64_encoded_media = base64.b64encode(media_bytes.read()).decode(
                        "utf-8"
                    )

                    recipes_dict[key][
                        "image"
                    ] = f"data:image/jpeg;base64,{base64_encoded_media}"
        return recipes_dict

    @app.route("/api/search")
    @jwt_required()
    async def search():
        query = request.args.get("query")
        if query == "":
            return None
        recipes_list = await fetch_recipes(query)
        recipes_dict = await organize_recipes_dict(recipes_list=recipes_list)
        return jsonify(recipes_dict)

    @app.route("/api/login", methods=["POST"])
    async def login():
        user_data = request.json
        user_id = user_data.get("id")

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
        if user_id == "guest":
            session["edit_permission"] = False
            app.logger.info(f"Session valid for user_id: {user_id}")
            return (
                jsonify({"authenticated": True, "canEdit": False, "user_id": user_id}),
                200,
            )
        elif user_id == current_user:
            permission = await check_user_edit_permission(user_id, channel_url)
            session["edit_permission"] = permission
            app.logger.info(f"Session valid for user_id: {user_id}")
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
        client = TelegramClient(session_name, bot_id, api_hash)
        async with client:
            channel_entity = await client.get_entity(channel_url)
            try:
                # Fetch the user's permissions in the channel
                permissions = await client.get_permissions(channel_entity, user_id)

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
    def reformat_recipe():
        data = request.get_json()
        if "text" not in data:
            return jsonify({"error": "Missing text"}), 400

        prompt = """המטרה: לארגן את המתכון הבא לפורמט ברור ומסודר שיכלול שלושה חלקים עיקריים: כותרת, רשימת מצרכים והוראות הכנה. הפורמט צריך להיות קבוע וחזרתי כדי שיהיה נוח לקרוא בטלגרם ולהציג באפליקציה. השתמש בפיסוק ברור ובעברית תקנית. אל תשנה או תוסיף תוכן כמו גמויות או פעולות לביצוע - המטרה לארגן.

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
1. נחמם את התנור ל-180 מעלות.
2. בקערה גדולה, נרבב יחד את הביצים, הסוכר, הקמח, השמן, השוקולד ואבקת האפייה.
3. נשפוך את התערובת לתבנית ונאפה עד שהעוגה מוכנה.

"""

        try:
            response = openAiClient.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": data["text"]},
                ],
                max_tokens=500,
                temperature=0.5,
                top_p=1.0,
                frequency_penalty=0.0,
                presence_penalty=0.0,
            )
            print(response)
            return ({"reformatted_text": response.choices[0].message.content}), 200
        except Exception as e:
            print(e)
            return jsonify({"error": str(e)}), 500

    @app.route("/api/update_recipe", methods=["POST"])
    async def update_recipe():
        data = request.get_json()
        print(data)
        message_id = int(data.get("messageId"))
        new_text = data.get("newText")
        client = TelegramClient(session_name, bot_id, api_hash)

        try:
            async with client:
                channel_entity = await client.get_entity(channel_url)
                message = await client.get_messages(channel_entity, ids=message_id)
                print(message, flush=True)
                if message:
                    try:
                        await client.edit_message(channel_entity, message, new_text)
                        return jsonify({"status": "message_updated"}), 200
                    except errors.MessageNotModifiedError as e:
                        print(e, flush=True)
                        try:
                            if message.photo:
                                new_msg = await client.send_message(
                                    channel_entity, new_text, file=message.photo
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
            return jsonify({"error": str(e)}), 500

    # from . import db

    # db.init_app(app)

    # from . import auth

    # app.register_blueprint(auth.bp)

    app.add_url_rule("/", endpoint="index")

    return app
