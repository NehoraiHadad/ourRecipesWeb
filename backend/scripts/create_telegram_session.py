from telethon import TelegramClient
import os
from dotenv import load_dotenv

load_dotenv()

# Load environment variables
SESSION_NAME = os.getenv("SESSION_NAME", "connect_to_our_recipes_channel")
BOT_ID = os.getenv("BOT_ID")
API_HASH = os.getenv("API_HASH")
BOT_TOKEN = os.getenv("BOT_TOKEN")

if not all([BOT_ID, API_HASH, BOT_TOKEN]):
    raise ValueError("Missing required environment variables")

async def main():
    # Create the client and connect
    client = TelegramClient(SESSION_NAME, int(BOT_ID), API_HASH)
    
    print("Starting client...")
    async with client:
        print("Client is ready!")
        print(f"Session file created: {SESSION_NAME}.session")
    

if __name__ == "__main__":
    import asyncio
    asyncio.run(main()) 