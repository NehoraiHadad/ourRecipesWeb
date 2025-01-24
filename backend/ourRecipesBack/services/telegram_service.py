from telethon import TelegramClient
from flask import current_app
from io import BytesIO
import asyncio
import os
from datetime import datetime, timezone

class TelegramService:
    """Service for handling Telegram operations"""

    @classmethod
    def get_session_path(cls, session_name):
        """Get the full path for a session file"""
        sessions_dir = '/app/sessions'
        if not os.path.exists(sessions_dir):
            sessions_dir = os.path.join(os.getcwd(), 'sessions')
        return os.path.join(sessions_dir, f"{session_name}.session")

    @classmethod
    async def check_session_status(cls, app):
        """Check status of all session files and return detailed information"""
        session_files = {
            'connect_to_our_recipes_channel.session': {
                'required': True,
                'min_size': 100,  # Minimum expected size in bytes
                'description': 'Main channel session'
            },
            'connect_to_our_recipes_channel_monitor.session': {
                'required': True,
                'min_size': 100,
                'description': 'Monitor channel session'
            }
        }
        
        status = {
            'status': 'healthy',
            'files': {},
            'details': {},
            'last_check': datetime.now(timezone.utc).isoformat()
        }
        
        for filename, config in session_files.items():
            path = cls.get_session_path(filename.replace('.session', ''))
            file_status = {
                'exists': os.path.exists(path),
                'size': os.path.getsize(path) if os.path.exists(path) else 0,
                'last_modified': datetime.fromtimestamp(os.path.getmtime(path)).isoformat() if os.path.exists(path) else None,
                'description': config['description']
            }
            
            # Check if file exists and meets size requirements
            if not file_status['exists']:
                file_status['status'] = 'missing'
                if config['required']:
                    status['status'] = 'error'
            elif file_status['size'] < config['min_size']:
                file_status['status'] = 'possibly_corrupt'
                if config['required']:
                    status['status'] = 'error'
            else:
                file_status['status'] = 'ok'
            
            status['files'][filename] = file_status['status']
            status['details'][filename] = file_status
            
        return status

    @classmethod
    async def refresh_session_files(cls, app):
        """Download fresh session files from Google Drive"""
        from .google_drive_service import download_session_files
        
        try:
            # First check current status
            current_status = await cls.check_session_status(app)
            if current_status['status'] == 'healthy':
                return {'status': 'ok', 'message': 'Session files are healthy, no refresh needed'}
            
            # Download fresh files
            download_session_files(app)
            
            # Check status again
            new_status = await cls.check_session_status(app)
            
            return {
                'status': 'ok' if new_status['status'] == 'healthy' else 'error',
                'message': 'Session files refreshed successfully' if new_status['status'] == 'healthy' else 'Session files refresh failed',
                'details': new_status
            }
            
        except Exception as e:
            app.logger.error(f"Failed to refresh session files: {str(e)}")
            return {
                'status': 'error',
                'message': f"Failed to refresh session files: {str(e)}",
                'error': str(e)
            }

    @classmethod
    async def create_client(cls):
        """Create a new TelegramClient instance"""
        session_path = cls.get_session_path(current_app.config["SESSION_NAME"])
        print(f"Creating TelegramClient with session path: {session_path}", flush=True)
        client = TelegramClient(
            session=session_path,
            api_id=int(current_app.config["BOT_ID"]),
            api_hash=current_app.config["API_HASH"]
        )
        return client

    @classmethod
    def create_client_with_session(cls, session_name, api_id, api_hash):
        """Create a new TelegramClient instance with a custom session name"""
        session_path = cls.get_session_path(session_name)
        print(f"Creating TelegramClient with session path: {session_path}", flush=True)
        client = TelegramClient(
            session=session_path,
            api_id=api_id,
            api_hash=api_hash
        )
        print(f"TelegramClient created with session path: {session_path}", flush=True)
        return client

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