import os

from telethon import TelegramClient
import base64
from io import BytesIO

from flask import Flask, request, jsonify
from flask_cors import CORS


def create_app(test_config=None):

    # create and configure the app.
    app = Flask(__name__, instance_relative_config=True)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

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
    async def search():
        query = request.args.get("query")
        if query == "":
            return jsonify(recipes_dict)
        recipes_list = await fetch_recipes(query)
        print(recipes_list)
        recipes_dict = await organize_recipes_dict(recipes_list=recipes_list)
        return jsonify(recipes_dict)

    @app.route("/api/login", methods=["POST"])
    def verify_telegram_user():
        # Extract the incoming JSON data
        auth_data = request.json
        print(auth_data)

    # from . import db

    # db.init_app(app)

    # from . import auth

    # app.register_blueprint(auth.bp)

    app.add_url_rule("/", endpoint="index")

    return app
