from typing import Dict, Optional, Union
from ..models.enums import RecipeStatus, RecipeDifficulty, QueueStatus, QueueActionType

def validate_recipe_data(data: Dict) -> tuple[bool, Optional[str]]:
    """
    Validate recipe data structure
    
    Args:
        data (dict): Recipe data to validate
        
    Returns:
        tuple: (is_valid, error_message)
    """
    required_fields = ['title', 'raw_content']
    
    # Check required fields
    for field in required_fields:
        if field not in data or not data[field]:
            return False, f"Missing required field: {field}"
            
    # Validate status if provided
    if 'status' in data:
        try:
            RecipeStatus(data['status'])
        except ValueError:
            return False, f"Invalid status: {data['status']}"
            
    # Validate difficulty if provided
    if 'difficulty' in data:
        try:
            RecipeDifficulty(data['difficulty'])
        except ValueError:
            return False, f"Invalid difficulty: {data['difficulty']}"
            
    return True, None

def validate_recipe_text(text: str) -> tuple[bool, Optional[str]]:
    """
    Validate recipe text format
    
    Args:
        text (str): Recipe text to validate
        
    Returns:
        tuple: (is_valid, error_message)
    """
    required_sections = ['כותרת:', 'רשימת מצרכים:', 'הוראות הכנה:']
    
    # Check for required sections
    for section in required_sections:
        if section not in text:
            return False, f"Missing required section: {section}"
            
    # Basic structure validation
    lines = text.split('\n')
    if not lines:
        return False, "Empty recipe text"
        
    # Title should be first
    if not lines[0].startswith('כותרת:'):
        return False, "Recipe must start with title"
        
    return True, None

def validate_sync_data(data: Dict) -> tuple[bool, Optional[str]]:
    """
    Validate sync queue data
    
    Args:
        data (dict): Sync data to validate
        
    Returns:
        tuple: (is_valid, error_message)
    """
    required_fields = ['action_type', 'user_id']
    
    # Check required fields
    for field in required_fields:
        if field not in data:
            return False, f"Missing required field: {field}"
            
    # Validate action type
    try:
        QueueActionType(data['action_type'])
    except ValueError:
        return False, f"Invalid action type: {data['action_type']}"
        
    # Validate status if provided
    if 'status' in data:
        try:
            QueueStatus(data['status'])
        except ValueError:
            return False, f"Invalid status: {data['status']}"
            
    return True, None

def validate_image_data(image_data: Union[str, bytes]) -> tuple[bool, Optional[str]]:
    """
    Validate image data
    
    Args:
        image_data: Image data to validate (base64 string or bytes)
        
    Returns:
        tuple: (is_valid, error_message)
    """
    if isinstance(image_data, str):
        # Validate base64 format
        if not image_data.startswith('data:image/'):
            return False, "Invalid image format: must be base64 data URL"
            
        try:
            # Check if we can split the data
            header, content = image_data.split(';base64,')
            if not content:
                return False, "Empty image data"
        except ValueError:
            return False, "Invalid base64 format"
            
    elif isinstance(image_data, bytes):
        # Basic size validation
        if len(image_data) == 0:
            return False, "Empty image data"
        if len(image_data) > 10 * 1024 * 1024:  # 10MB limit
            return False, "Image too large (max 10MB)"
            
    else:
        return False, "Invalid image data type"
        
    return True, None

def validate_version_data(data: Dict) -> tuple[bool, Optional[str]]:
    """
    Validate version data
    
    Args:
        data (dict): Version data to validate
        
    Returns:
        tuple: (is_valid, error_message)
    """
    required_fields = ['content']
    
    # Check required fields
    for field in required_fields:
        if field not in data:
            return False, f"Missing required field: {field}"
            
    # Validate content structure
    content = data['content']
    if not isinstance(content, dict):
        return False, "Content must be a dictionary"
        
    required_content_fields = ['title', 'raw_content']
    for field in required_content_fields:
        if field not in content:
            return False, f"Missing required content field: {field}"
            
    return True, None 