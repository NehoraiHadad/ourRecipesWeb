from telethon import TelegramClient
from flask import current_app
from io import BytesIO

class TelegramService:
    """Service for handling Telegram operations"""

    @classmethod
    async def create_client(cls):
        """Create a new TelegramClient instance"""
        client = TelegramClient(
            session=current_app.config["SESSION_NAME"],
            api_id=int(current_app.config["BOT_ID"]),
            api_hash=current_app.config["API_HASH"]
        )
        return client

    @classmethod
    async def check_permissions(cls, user_id, channel_url):
        """Check user permissions in channel"""
        try:
            print(f"Checking permissions for user {user_id} in channel {channel_url}", flush=True)
            client = await cls.create_client()
            async with client:
                channel_entity = await client.get_entity(channel_url)
                permissions = await client.get_permissions(channel_entity, int(user_id))
                
                has_permission = permissions.is_admin and permissions.edit_messages
                print(f"User {user_id} {'can' if has_permission else 'cannot'} edit messages in the channel.", flush=True)
                return has_permission
                    
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

# Create service instance
telegram_service = TelegramService()