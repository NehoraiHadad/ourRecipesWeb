"""One-time interactive helper: generate a Telethon StringSession.

Run it locally, log in with the phone number of a user account that is a
member of the recipes channel, and paste the printed SESSION_STRING into
api-python/.env (and anywhere else it is needed).

    cd api-python
    .venv/Scripts/python generate_session.py      # Windows
    .venv/bin/python generate_session.py          # macOS/Linux
"""
import os

from dotenv import load_dotenv
from telethon.sessions import StringSession
from telethon.sync import TelegramClient

load_dotenv()

api_id = int(os.environ["TELEGRAM_API_ID"])
api_hash = os.environ["TELEGRAM_API_HASH"]

with TelegramClient(StringSession(), api_id, api_hash) as client:
    print("\nSESSION_STRING (keep it secret, treat it like a password):\n")
    print(client.session.save())
