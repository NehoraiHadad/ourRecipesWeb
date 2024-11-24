from datetime import datetime, timezone
from ourRecipesBack.models import Recipe, SyncLog, Category, UserRecipe, RecipeVersion, SyncQueue, RecipeStatus, RecipeDifficulty, SyncStatus, QueueStatus, QueueActionType
from ourRecipesBack.extensions import db
import pytest

class TestRecipeModel:
    def test_recipe_creation(self, app):
        """Test basic recipe creation"""
        with app.app_context():
            recipe = Recipe(
                telegram_id=123,
                raw_content="Test Recipe Content",
                title="Test Recipe"
            )
            db.session.add(recipe)
            db.session.commit()
            
            assert recipe.id is not None
            assert recipe.telegram_id == 123
            assert recipe.status == 'active'
            assert recipe.created_at is not None
    
    def test_recipe_image_handling(self, app):
        """Test image handling in recipes"""
        with app.app_context():
            # Test URL-based image
            recipe1 = Recipe(
                telegram_id=124,
                raw_content="Recipe with URL image"
            )
            recipe1.set_image(image_url="http://example.com/image.jpg")
            
            # Test binary image data
            test_image_data = b"fake_image_data"
            recipe2 = Recipe(
                telegram_id=125,
                raw_content="Recipe with binary image"
            )
            recipe2.set_image(image_data=test_image_data)
            
            db.session.add_all([recipe1, recipe2])
            db.session.commit()
            
            # Check URL image
            assert recipe1.image['type'] == 'url'
            assert recipe1.image['data'] == "http://example.com/image.jpg"
            
            # Check binary image
            assert recipe2.image['type'] == 'base64'
            assert "data:image/jpeg;base64," in recipe2.image['data']
    
    def test_recipe_validation(self, app):
        """Test recipe status and difficulty validation"""
        with app.app_context():
            recipe = Recipe(telegram_id=1, raw_content="Test content")
            
            # Test valid status
            recipe.status = RecipeStatus.ACTIVE.value
            recipe.validate()  # Should not raise
            
            # Test invalid status
            with pytest.raises(ValueError):
                recipe.status = "invalid_status"
                recipe.validate()

class TestSyncLogModel:
    def test_sync_log_creation(self, app):
        """Test sync log creation and updates"""
        with app.app_context():
            sync_log = SyncLog(sync_type='full')
            db.session.add(sync_log)
            db.session.commit()
            
            assert sync_log.status == 'in_progress'
            assert sync_log.started_at is not None
            assert sync_log.recipes_processed == 0
            
            # Simulate sync progress
            sync_log.recipes_processed = 5
            sync_log.recipes_added = 3
            sync_log.recipes_updated = 2
            sync_log.status = 'success'
            sync_log.completed_at = datetime.now(timezone.utc)
            db.session.commit()
            
            assert sync_log.recipes_processed == 5
            assert sync_log.status == 'success'

class TestCategoryModel:
    def test_category_hierarchy(self, app):
        """Test category path and hierarchy"""
        with app.app_context():
            parent = Category(name="Main")
            child = Category(name="Sub", parent_id=parent.id)
            child.parent = parent
            
            parent.update_path()
            child.update_path()
            
            assert parent.level == 0
            assert child.level == 1
            assert child.path == "Main/Sub"

class TestSyncQueueModel:
    def test_sync_queue_workflow(self, app):
        """Test sync queue status transitions"""
        with app.app_context():
            queue_entry = SyncQueue(
                user_id="test_user",
                action_type=QueueActionType.CREATE.value,
                recipe_id=1
            )
            
            assert queue_entry.status == QueueStatus.PENDING.value
            
            queue_entry.mark_completed(success=True)
            assert queue_entry.status == QueueStatus.COMPLETED.value
            
            queue_entry.mark_completed(success=False)
            assert queue_entry.status == QueueStatus.FAILED.value 