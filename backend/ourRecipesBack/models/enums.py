from enum import Enum

class RecipeStatus(Enum):
    """Recipe status options"""
    ACTIVE = 'active'
    ARCHIVED = 'archived'
    DELETED = 'deleted'

class RecipeDifficulty(Enum):
    """Recipe difficulty levels"""
    EASY = 'easy'
    MEDIUM = 'medium'
    HARD = 'hard'

    @classmethod
    def get_display_name(cls, value):
        display_names = {
            'easy': 'קל',
            'medium': 'בינוני',
            'hard': 'מורכב'
        }
        return display_names.get(value, value)

class SyncStatus(Enum):
    """Sync operation status"""
    SUCCESS = 'success'
    FAILED = 'failed'
    PENDING = 'pending'
    IN_PROGRESS = 'in_progress'

class QueueStatus(Enum):
    """Queue item status"""
    PENDING = 'pending'
    COMPLETED = 'completed'
    FAILED = 'failed'

class QueueActionType(Enum):
    """Queue action types"""
    CREATE = 'create'
    UPDATE = 'update'
    DELETE = 'delete' 