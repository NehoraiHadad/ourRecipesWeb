from io import BytesIO
from flask import current_app
from ..extensions import db
from ..models.recipe import Recipe
from .telegram_service import telegram_service
from ..models.enums import RecipeDifficulty
from .ai_service import AIService
from sqlalchemy.sql import func
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

class RecipeService:
    """Service class for handling recipe operations"""

    @staticmethod
    def get_recipe(telegram_id):
        """Get recipe by telegram ID"""
        return Recipe.query.filter_by(telegram_id=telegram_id).first()

    @staticmethod
    def get_first_line(text):
        """Extract first line from recipe text"""
        if not text:
            return ""
        return text.split("\n", 1)[0].strip("*:")

    @staticmethod
    def get_details(text):
        """Get recipe details (everything after first line)"""
        if not text:
            return ""
        parts = text.splitlines()
        return "\n".join(parts[1:]) if len(parts) > 1 else ""

    @classmethod
    async def create_recipe(cls, text, image_data=None, created_by=None):
        """Create new recipe and send to Telegram"""
        try:
            client = await telegram_service.get_client()
            async with client:
                channel_entity = await client.get_entity(current_app.config["CHANNEL_URL"])

                if image_data:
                    file = BytesIO(image_data)
                    file.name = "image.jpg"
                    message = await client.send_message(
                        channel_entity,
                        text,
                        file=file
                    )
                else:
                    message = await client.send_message(channel_entity, text)

                if not message:
                    return None, None

                recipe = Recipe(
                    telegram_id=message.id,
                    title=cls.get_first_line(text),
                    raw_content=text,
                    image_data=image_data
                )

                db.session.add(recipe)
                db.session.commit()

                # Add recipe URL to Telegram message
                frontend_url = current_app.config.get("FRONTEND_URL", "https://ourrecipes.com")
                recipe_url = f"{frontend_url}/r/{recipe.id}"
                updated_text = f"{text}\n\n🔗 קישור למתכון: {recipe_url}"

                try:
                    # Edit the message to include the URL
                    if image_data:
                        file = BytesIO(image_data)
                        file.name = "image.jpg"
                        await client.edit_message(channel_entity, message.id, updated_text, file=file)
                    else:
                        await client.edit_message(channel_entity, message.id, updated_text)

                    # Update the recipe content in DB to include the URL
                    recipe.raw_content = updated_text
                    db.session.commit()
                except Exception as e:
                    # Log the error but don't fail the recipe creation
                    print(f"Warning: Failed to add URL to Telegram message: {str(e)}")

                return recipe, message.id

        except Exception as e:
            print(f"Error creating recipe: {str(e)}")
            db.session.rollback()
            return None, None

    @classmethod
    async def update_recipe(cls, telegram_id, new_text, image_data=None, created_by=None):
        """Update existing recipe"""
        recipe = cls.get_recipe(telegram_id)
        if not recipe:
            return None, "Recipe not found"

        try:
            # Add recipe URL if not already present
            frontend_url = current_app.config.get("FRONTEND_URL", "https://ourrecipes.com")
            recipe_url = f"{frontend_url}/r/{recipe.id}"
            url_marker = "🔗 קישור למתכון:"

            # Check if URL is already in the text
            if url_marker not in new_text:
                new_text = f"{new_text}\n\n{url_marker} {recipe_url}"

            # Check if content is actually different
            if recipe.raw_content == new_text and not image_data:
                # Content hasn't changed, return success without making Telegram API call
                return recipe, None

            # DB update
            recipe.update_content(
                title=cls.get_first_line(new_text),
                raw_content=new_text,
                image_data=image_data,
                created_by=created_by,
                change_description="Recipe update"
            )

            # Telegram update
            success = await telegram_service.edit_message(
                telegram_id,
                new_text,
                image_data
            )

            if success:
                db.session.commit()
                return recipe, None
            else:
                db.session.rollback()
                return None, "Failed to update Telegram message"

        except Exception as e:
            db.session.rollback()
            error_msg = str(e)
            # Handle Telegram's "message not modified" error gracefully
            if "message was not modified" in error_msg.lower():
                # If the message wasn't modified but everything else is fine,
                # we can consider this a success
                return recipe, "not modified"
            return None, error_msg

    @classmethod
    async def sync_message(cls, client, message, sync_log):
        """
        Sync single Telegram message to database (READ-ONLY from Telegram)

        This function only reads from Telegram and updates the local DB.
        It does NOT modify Telegram messages during sync.
        URLs are added to Telegram messages only when creating/updating recipes through the app.
        """
        try:
            if not message or not message.text:
                sync_log.recipes_failed += 1
                return

            existing_recipe = Recipe.query.filter_by(telegram_id=message.id).first()

            # Download media in parallel if it exists
            media_data = None
            if message.media:
                media_bytes = BytesIO()
                await client.download_media(message.media, file=media_bytes)
                media_bytes.seek(0)
                media_data = media_bytes.read()

            # Simply use the message text as-is (read-only)
            message_text = message.text

            if existing_recipe:
                # Update existing recipe with whatever is in Telegram
                existing_recipe.title = cls.get_first_line(message_text)
                existing_recipe.raw_content = message_text
                existing_recipe._parse_content(message_text)
                if media_data:
                    existing_recipe.set_image(image_data=media_data)
                existing_recipe.last_sync = func.now()  # Mark as synced
                sync_log.recipes_updated += 1
            else:
                # Create new recipe from Telegram message (as-is)
                new_recipe = Recipe(
                    telegram_id=message.id,
                    title=cls.get_first_line(message_text),
                    raw_content=message_text,
                    last_sync=func.now()  # Set initial sync time
                )
                new_recipe._parse_content(message_text)
                if media_data:
                    new_recipe.set_image(image_data=media_data)
                db.session.add(new_recipe)
                sync_log.recipes_added += 1

            sync_log.recipes_processed += 1
            logger.info(f"Recipe message {message.id} synced successfully")

        except Exception as e:
            sync_log.recipes_failed += 1
            print(f"Error processing message {message.id}: {str(e)}")
            raise

    @classmethod
    def search_recipes(cls, query=None, categories=None, prep_time=None, difficulty=None, 
                      include_terms=None, exclude_terms=None):
        """
        Search recipes with advanced filters
        
        Args:
            query (str): Text to search for
            categories (list): Categories to filter by
            prep_time (int): Maximum preparation time in minutes
            difficulty (str): Recipe difficulty level
            include_terms (list): Terms that must be included
            exclude_terms (list): Terms that must not be included
        """
        try:
            recipes_query = Recipe.query

            # Text search
            if query:
                search_pattern = f"%{query}%"
                recipes_query = recipes_query.filter(
                    db.or_(
                        Recipe.title.ilike(search_pattern),
                        Recipe.raw_content.ilike(search_pattern)
                    )
                )

            # Category filter
            if categories:
                for category in categories:
                    recipes_query = recipes_query.filter(Recipe._categories.ilike(f"%{category}%"))

            # Preparation time filter
            if prep_time:
                recipes_query = recipes_query.filter(Recipe.preparation_time <= int(prep_time))

            # Difficulty filter
            if difficulty:
                try:
                    difficulty_enum = RecipeDifficulty[difficulty.upper()]
                    recipes_query = recipes_query.filter(Recipe.difficulty == difficulty_enum)
                except KeyError:
                    print(f"Invalid difficulty value: {difficulty}")

            # Text content filters
            if include_terms:
                for term in include_terms:
                    recipes_query = recipes_query.filter(Recipe.raw_content.ilike(f"%{term}%"))
            
            if exclude_terms:
                for term in exclude_terms:
                    recipes_query = recipes_query.filter(~Recipe.raw_content.ilike(f"%{term}%"))

            # Execute query and format results
            recipes = recipes_query.all()
            return cls._format_search_results(recipes)

        except Exception as e:
            print(f"Search error in service: {str(e)}", flush=True)
            raise

    @staticmethod
    def _format_search_results(recipes):
        """Format recipes for search results"""
        results = {}
        for recipe in recipes:
            # Use database ID as key for consistency
            results[str(recipe.id)] = {
                "id": recipe.id,  # Return database ID (primary key)
                "telegram_id": recipe.telegram_id,
                "title": recipe.title,
                "details": recipe.raw_content,
                "image": recipe.get_image_url() if hasattr(recipe, 'get_image_url') else None,
                "categories": recipe.categories,
                "preparation_time": recipe.preparation_time,
                "difficulty": recipe.difficulty.value if recipe.difficulty else None
            }
        return results

    @staticmethod
    def get_recipes_for_management():
        """Get all recipes with management metadata"""
        try:
            recipes = Recipe.query.order_by(Recipe.created_at.desc()).all()
            return [
                {
                    "id": recipe.id,
                    "telegram_id": recipe.telegram_id,
                    "title": recipe.title,
                    "raw_content": recipe.raw_content,
                    "categories": recipe.categories,
                    "difficulty": recipe.difficulty.value if recipe.difficulty else None,
                    "preparation_time": recipe.preparation_time,
                    "ingredients": recipe.ingredients,
                    "instructions": recipe.instructions,
                    "is_parsed": recipe.is_parsed,
                    "parse_errors": recipe.parse_errors,
                    "created_at": recipe.created_at.isoformat() if recipe.created_at else None,
                    "updated_at": recipe.updated_at.isoformat() if recipe.updated_at else None,
                    "image": recipe.get_image_url() if hasattr(recipe, 'get_image_url') else None,
                }
                for recipe in recipes
            ]
        except Exception as e:
            print(f"Error fetching recipes for management: {str(e)}", flush=True)
            raise

    @classmethod
    async def bulk_parse_recipes(cls, recipe_ids):
        """
        Parse multiple recipes in bulk using AI and update both DB and Telegram
        
        Args:
            recipe_ids (list): List of recipe IDs to parse
            
        Returns:
            dict: Results of bulk operation
        """
        try:
            processed = 0
            failed = 0
            recipes = Recipe.query.filter(Recipe.id.in_(recipe_ids)).all()
            
            for recipe in recipes:
                try:
                    if recipe.raw_content and recipe.telegram_id:
                        # AI reformatting
                        reformatted_text = AIService.reformat_recipe(recipe.raw_content)
                        
                        # Update Telegram first
                        telegram_success = await telegram_service.edit_message(
                            recipe.telegram_id,
                            reformatted_text,
                            recipe.image_data if hasattr(recipe, 'image_data') else None
                        )
                        
                        if telegram_success:
                            # If Telegram update succeeded, update DB
                            recipe.update_content(
                                title=cls.get_first_line(reformatted_text),
                                raw_content=reformatted_text,
                                created_by="AI Parser",
                                change_description="AI Bulk Parse"
                            )
                            processed += 1
                        else:
                            failed += 1
                            print(f"Telegram update failed for recipe {recipe.id}")
                    else:
                        failed += 1
                        print(f"Recipe {recipe.id} missing content or telegram_id")
                except Exception as e:
                    print(f"Error parsing recipe {recipe.id}: {str(e)}")
                    failed += 1
                    continue
            
            db.session.commit()
            return {
                "processed": processed,
                "failed": failed,
                "total": len(recipe_ids)
            }
            
        except Exception as e:
            db.session.rollback()
            print(f"Bulk parse error: {str(e)}")
            raise

    @classmethod
    def get_search_suggestions(cls, query: str, limit: int = 5) -> list[str]:
        """
        Get search suggestions based on recipe titles and categories
        
        Args:
            query (str): The search query
            limit (int): Maximum number of suggestions to return
            
        Returns:
            list[str]: List of suggested search terms
        """
        try:
            if not query or len(query.strip()) < 2:
                return []

            search_pattern = f"%{query}%"
            
            # Search in titles and categories
            recipes = Recipe.query.filter(
                db.or_(
                    Recipe.title.ilike(search_pattern),
                    Recipe._categories.ilike(search_pattern)
                )
            ).limit(limit).all()
            
            suggestions = set()
            
            for recipe in recipes:
                # Add matching title if it contains the query
                if query.lower() in recipe.title.lower():
                    suggestions.add(recipe.title)
                
                # Add matching categories
                if recipe.categories:
                    for category in recipe.categories:
                        if query.lower() in category.lower():
                            suggestions.add(category)
            
            return list(suggestions)[:limit]
            
        except Exception as e:
            print(f"Error getting search suggestions: {str(e)}", flush=True)
            return []

def get_recipe_by_id(recipe_id: int) -> dict:
    """
    Get recipe details by database ID

    Args:
        recipe_id (int): The database ID of the recipe to fetch

    Returns:
        dict: Recipe details or None if not found
    """
    # CRITICAL FIX: Query by database ID, not telegram_id
    # The frontend sends recipe.id (database ID) from MenuDisplay
    recipe = Recipe.query.filter_by(id=recipe_id).first()
    if recipe is None:
        return None

    return {
        'id': recipe.id,  # Return database ID (primary key)
        'title': recipe.title,
        'details': recipe.raw_content,  # Use raw_content instead of details
        'image': recipe.get_image_url() if hasattr(recipe, 'get_image_url') else None,
        'telegram_id': recipe.telegram_id,
        'created_at': recipe.created_at.isoformat(),
        'updated_at': recipe.updated_at.isoformat() if recipe.updated_at else None,
        'is_parsed': recipe.is_parsed,
        'parse_errors': recipe.parse_errors,
        'ingredients': recipe.ingredients,
        'instructions': recipe.instructions,
        'categories': recipe.categories,
        'preparation_time': recipe.preparation_time,
        'difficulty': recipe.difficulty.value if recipe.difficulty else None
    }