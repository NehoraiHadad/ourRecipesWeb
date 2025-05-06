from telethon import TelegramClient
from telethon.sessions import StringSession
import os
from dotenv import load_dotenv

load_dotenv()

# Load environment variables
BOT_ID = os.getenv("BOT_ID")
API_HASH = os.getenv("API_HASH")
BOT_TOKEN = os.getenv("BOT_TOKEN")

if not all([BOT_ID, API_HASH]):
    raise ValueError("Missing required environment variables")

async def main():
    # Create the client with StringSession
    client = TelegramClient(StringSession(), int(BOT_ID), API_HASH)
    
    print("Starting client...")
    await client.start()
    
    # Save the session string
    session_string = client.session.save()
    print("\n\nYour session string is (copy this to your .env file as SESSION_STRING):")
    print(f"\n{session_string}\n")
    print("WARNING: Keep this string safe! Anyone with this string can access your Telegram account.")
    
    await client.disconnect()

if __name__ == "__main__":
    import asyncio
    asyncio.run(main()) 