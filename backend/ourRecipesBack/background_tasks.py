import asyncio
import os
import threading
from telethon import TelegramClient, events
from datetime import datetime, timezone

from .services.telegram_service import TelegramService
from .services.recipe_service import RecipeService
from .models.sync import SyncLog
from .models.recipe import Recipe
from .extensions import db
from .routes.sync import _perform_sync, _create_sync_log

async def process_new_message(send_client, message, new_channel, sync_log):
    """Process a single new message - copy it to the new channel and sync to DB"""
    try:
        async with send_client:
            # Get media if exists
            media = None
            if message.media:
                media = await message.download_media(bytes)
        
            # Send as new message (not forward)
            sent_message = await send_client.send_message(
                new_channel,
                message.text,
                file=media if media else None
            )
        
            if sent_message:
                print(f"Successfully copied message {message.id}", flush=True)
                
                # Sync the new message to DB
                await RecipeService.sync_message(send_client, sent_message, sync_log)
                print(f"Successfully synced message {message.id} to DB", flush=True)
                
                return True
    except Exception as e:
        print(f"Error processing message {message.id}: {str(e)}", flush=True)
        sync_log.recipes_failed += 1
        db.session.commit()
    
    return False

async def monitor_old_channel(app):
    """Monitor old channel for new messages and sync them to new channel"""
    print("Starting old channel monitoring...", flush=True)
    
    with app.app_context():
        try:
            # Create sync log for monitoring session
            sync_log = SyncLog(sync_type="monitor")
            db.session.add(sync_log)
            db.session.commit()
            
            # Create monitor client
            monitor_client = TelegramClient(
                session=f"{app.config['SESSION_NAME']}_monitor",
                api_id=int(app.config["BOT_ID"]),
                api_hash=app.config["API_HASH"]
            )
            
            await monitor_client.connect()
            if not await monitor_client.is_user_authorized():
                print("Session is not authorized", flush=True)
                return
                
            # Get channel entities once
            new_channel = await monitor_client.get_entity(app.config["CHANNEL_URL"])
            old_channel = await monitor_client.get_entity(app.config["OLD_CHANNEL_URL"])
            
            print(f"Started monitoring channel: {app.config['OLD_CHANNEL_URL']}", flush=True)
            
            @monitor_client.on(events.NewMessage(chats=old_channel))
            async def handle_new_message(event):
                """Handle new message event"""
                if event.message.text:  # Only process messages with text
                    print(f"New message received: {event.message.id}", flush=True)
                    await process_new_message(await TelegramService.create_client(), event.message, new_channel, sync_log)
            
            # Run the client until disconnected
            await monitor_client.run_until_disconnected()
                        
        except Exception as e:
            print(f"Fatal error in monitoring: {str(e)}", flush=True)
            if sync_log:
                sync_log.status = "failed"
                sync_log.error_message = str(e)
                db.session.commit()
            raise
        finally:
            if sync_log:
                sync_log.status = "completed"
                db.session.commit()
            await monitor_client.disconnect()

def run_monitor(app):
    """Run the monitor in a separate event loop"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(monitor_old_channel(app))
    except Exception as e:
        print(f"Monitor error: {str(e)}", flush=True)
    finally:
        loop.close()

def run_recipe_check(app):
    """Run the recipe check in a separate thread"""
    async def _run():
        await check_and_sync_recipes(app)
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(_run())

def start_background_tasks(app):
    """Start all background tasks"""
    # Start monitor thread
    monitor_thread = threading.Thread(target=run_monitor, args=(app,), daemon=True)
    monitor_thread.start()
    
    # Start recipe check thread
    recipe_check_thread = threading.Thread(target=run_recipe_check, args=(app,), daemon=True)
    recipe_check_thread.start()

async def check_and_sync_recipes(app):
    """Periodically check if recipes exist in DB and trigger sync if needed"""
    print("Starting periodic recipe check...", flush=True)
    
    with app.app_context():
        while True:
            try:
                # Check if there are any recipes in the database
                recipe_count = Recipe.query.count()
                
                if recipe_count == 0:
                    print("No recipes found in database, triggering full sync...", flush=True)
                    
                    # Create sync log for the full sync
                    sync_log = _create_sync_log()
                    
                    try:
                        # Perform full sync
                        await _perform_sync(sync_log)
                        sync_log.status = "completed"
                        print("Full sync completed successfully", flush=True)
                    except Exception as e:
                        print(f"Error during full sync: {str(e)}", flush=True)
                        sync_log.status = "failed"
                        sync_log.error_message = str(e)
                    finally:
                        sync_log.completed_at = datetime.now(timezone.utc)
                        db.session.commit()
                
                # Wait for 5 minutes before next check
                await asyncio.sleep(300)
                
            except Exception as e:
                print(f"Error in recipe check: {str(e)}", flush=True)
                # Wait for 1 minute before retry in case of error
                await asyncio.sleep(60)