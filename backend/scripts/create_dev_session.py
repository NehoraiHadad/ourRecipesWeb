from telethon import TelegramClient
import os
import sys
from dotenv import load_dotenv
from pathlib import Path

# Get the absolute path to the backend directory
BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / '.env.development'
SESSIONS_DIR = BACKEND_DIR / 'sessions_dev'

# Load development environment variables
load_dotenv(ENV_FILE)

# Ensure the sessions_dev directory exists
os.makedirs(SESSIONS_DIR, exist_ok=True)

async def main():
    # Get credentials from environment
    api_id = os.getenv('BOT_ID')
    api_hash = os.getenv('API_HASH')
    
    if not api_id or not api_hash:
        print("Error: BOT_ID and API_HASH must be set in .env.development")
        sys.exit(1)

    # Create development session files
    session_names = [
        'connect_to_our_recipes_channel_dev',
        'connect_to_our_recipes_channel_monitor_dev'
    ]

    for session_name in session_names:
        session_path = SESSIONS_DIR / session_name
        client = TelegramClient(str(session_path), api_id, api_hash)
        
        try:
            print(f"\nCreating session: {session_name}")
            print(f"Session file will be created at: {session_path}.session")
            await client.start()
            print(f"Successfully created session: {session_name}")
        except Exception as e:
            print(f"Error creating session {session_name}: {e}")
        finally:
            await client.disconnect()

if __name__ == '__main__':
    import asyncio
    asyncio.run(main()) 