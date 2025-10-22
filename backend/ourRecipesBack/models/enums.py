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

class DietaryType(Enum):
    """Dietary type for kosher meals"""
    MEAT = 'meat'  # בשרי
    DAIRY = 'dairy'  # חלבי
    PAREVE = 'pareve'  # פרווה

    @classmethod
    def get_display_name(cls, value):
        display_names = {
            'meat': 'בשרי',
            'dairy': 'חלבי',
            'pareve': 'פרווה'
        }
        return display_names.get(value, value)

class CourseType(Enum):
    """Course type within a meal"""
    APPETIZER = 'appetizer'  # מנה ראשונה
    MAIN = 'main'  # מנה עיקרית
    SIDE = 'side'  # תוספת
    DESSERT = 'dessert'  # קינוח
    SALAD = 'salad'  # סלט
    SOUP = 'soup'  # מרק

    @classmethod
    def get_display_name(cls, value):
        display_names = {
            'appetizer': 'מנה ראשונה',
            'main': 'מנה עיקרית',
            'side': 'תוספת',
            'dessert': 'קינוח',
            'salad': 'סלט',
            'soup': 'מרק'
        }
        return display_names.get(value, value) 