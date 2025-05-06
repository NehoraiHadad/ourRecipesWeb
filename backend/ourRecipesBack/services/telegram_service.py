from telethon import TelegramClient
from telethon.sessions import StringSession
from flask import current_app
from io import BytesIO
import asyncio
import os
from datetime import datetime, timezone

class TelegramService:
    """Service for handling Telegram operations"""

    @classmethod
    def get_session_string(cls, app=None):
        """Get the session string from environment variables"""
        if app:
            return app.config.get("SESSION_STRING")
        return os.getenv("SESSION_STRING")

    @classmethod
    async def check_session_status(cls, app):
        """Check status of session string"""
        session_string = cls.get_session_string(app)
        
        status = {
            'status': 'healthy',
            'details': {},
            'last_check': datetime.now(timezone.utc).isoformat()
        }
        
        if not session_string:
            status['status'] = 'error'
            status['message'] = 'Session string is missing. Please set the SESSION_STRING environment variable.'
            return status
            
        # The session string exists, so we consider it healthy
        # A proper check would actually try to connect, but that's expensive
        status['message'] = 'Session string is present'
        
        return status

    @classmethod
    async def refresh_session_files(cls, app):
        """Legacy method for backward compatibility; not needed with session strings"""
        return {
            'status': 'ok',
            'message': 'Using session string - no need to refresh session files'
        }

    @classmethod
    async def create_client(cls):
        """Create a new TelegramClient instance using session string"""
        session_string = cls.get_session_string(current_app)
        
        if not session_string:
            raise ValueError("SESSION_STRING environment variable not set")
            
        print(f"Creating TelegramClient with session string", flush=True)
        client = TelegramClient(
            session=StringSession(session_string),
            api_id=int(current_app.config["BOT_ID"]),
            api_hash=current_app.config["API_HASH"]
        )
        return client

    @classmethod
    def create_client_with_session(cls, session_name, api_id, api_hash):
        """Create a new TelegramClient instance with a custom session string"""
        # For backward compatibility, check if SESSION_STRING_{session_name} exists
        env_var_name = f"SESSION_STRING_{session_name.upper()}"
        session_string = os.getenv(env_var_name)
        
        if not session_string:
            # Fall back to the old session file approach for backward compatibility
            session_path = cls.get_session_path(session_name)
            print(f"WARNING: No session string found for {session_name}, falling back to session file: {session_path}", flush=True)
            client = TelegramClient(
                session=session_path,
                api_id=api_id,
                api_hash=api_hash
            )
        else:
            # Use the session string
            print(f"Creating TelegramClient with session string for {session_name}", flush=True)
            client = TelegramClient(
                session=StringSession(session_string),
                api_id=api_id,
                api_hash=api_hash
            )
            
        return client
        
    @classmethod
    def get_session_path(cls, session_name, app=None):
        """Legacy method for backward compatibility"""
        sessions_dir = '/app/sessions'
        if not os.path.exists(sessions_dir):
            sessions_dir = os.path.join(os.getcwd(), 'sessions')

        return os.path.join(sessions_dir, f"{session_name}.session")

    @classmethod
    async def check_permissions(cls, user_id, channel_url):
        """Check user permissions in channel"""
        try:
            print(f"Checking permissions for user {user_id} in channel {channel_url}", flush=True)
            # Guest users never have permissions
            if isinstance(user_id, str) and user_id.startswith('guest_'):
                return False
                
            client = await cls.create_client()
            async with client:
                try:
                    channel_entity = await client.get_entity(channel_url)
                    permissions = await client.get_permissions(channel_entity, int(user_id))
                    
                    has_permission = permissions.is_admin and permissions.edit_messages
                    print(f"User {user_id} {'can' if has_permission else 'cannot'} edit messages in the channel.", flush=True)
                    return has_permission
                except ValueError as e:
                    print(f"Invalid user ID format: {str(e)}", flush=True)
                    return False
                except Exception as e:
                    if "not a member" in str(e).lower() or "no user" in str(e).lower():
                        print(f"User {user_id} is not a member of the channel", flush=True)
                        return False
                    raise  # Re-raise other exceptions
                    
        except Exception as e:
            print(f"Permission check error: {str(e)}", flush=True)
            return False

    @classmethod
    async def edit_message(cls, message_id, new_text, image_data=None):
        """Edit message in channel"""
        try:
            client = await cls.create_client()
            async with client:
                channel = await client.get_entity(current_app.config["CHANNEL_URL"])
                message = await client.get_messages(channel, ids=message_id)
                
                if not message:
                    return False
                
                if image_data:
                    file = BytesIO(image_data)
                    file.name = "image.jpg"
                    await client.edit_message(
                        channel, 
                        message_id, 
                        new_text,
                        file=file
                    )
                else:
                    await client.edit_message(channel, message_id, new_text)
                    
                return True
                
        except Exception as e:
            print(f"Error editing message: {str(e)}", flush=True)
            return False

    @classmethod
    async def send_message(cls, text, image_data=None):
        """Send new message to channel"""
        try:
            client = await cls.create_client()
            async with client:
                channel = await client.get_entity(current_app.config["CHANNEL_URL"])
                
                if image_data:
                    file = BytesIO(image_data)
                    file.name = "image.jpg"
                    message = await client.send_message(
                        channel,
                        text,
                        file=file
                    )
                else:
                    message = await client.send_message(channel, text)
                    
                return message
                
        except Exception as e:
            print(f"Error sending message: {str(e)}", flush=True)
            return None

    @classmethod
    async def get_message_text(cls, message_id):
        """Get text content of a message"""
        try:
            client = await cls.create_client()
            async with client:
                channel = await client.get_entity(current_app.config["CHANNEL_URL"])
                message = await client.get_messages(channel, ids=message_id)
                return message.text if message else None
        except Exception as e:
            print(f"Error getting message text: {str(e)}", flush=True)
            return None

    @classmethod
    def get_message_text_sync(cls, message_id):
        """Synchronous wrapper for get_message_text"""
        return asyncio.run(cls.get_message_text(message_id))

# Create service instance
telegram_service = TelegramService()