from typing import List, Dict, Optional

def format_recipe_text(title: str, categories: List[str], ingredients: List[str], 
                      instructions: str) -> str:
    """
    Format recipe text in standard format
    
    Args:
        title (str): Recipe title
        categories (list): Recipe categories
        ingredients (list): Recipe ingredients
        instructions (str): Cooking instructions
        
    Returns:
        str: Formatted recipe text
    """
    categories_str = ", ".join(categories) if categories else ""
    ingredients_str = "\n".join(f"- {ingredient}" for ingredient in ingredients)
    
    return f"""כותרת: {title}
קטגוריות: {categories_str}
רשימת מצרכים:
{ingredients_str}
הוראות הכנה:
{instructions}"""

def parse_recipe_text(text: str) -> Dict[str, any]:
    """
    Parse recipe text into components
    
    Args:
        text (str): Raw recipe text
        
    Returns:
        dict: Parsed recipe components
    """
    parts = text.split('\n')
    result = {
        'title': '',
        'categories': [],
        'ingredients': [],
        'instructions': ''
    }
    
    current_section = None
    
    for line in parts:
        line = line.strip()
        if not line:
            continue
            
        if line.startswith('כותרת:'):
            result['title'] = line.replace('כותרת:', '').strip()
        elif line.startswith('קטגוריות:'):
            categories = line.replace('קטגוריות:', '').split(',')
            result['categories'] = [cat.strip() for cat in categories if cat.strip()]
        elif line == 'רשימת מצרכים:':
            current_section = 'ingredients'
        elif line == 'הוראות הכנה:':
            current_section = 'instructions'
        elif current_section == 'ingredients' and line.startswith('-'):
            result['ingredients'].append(line.lstrip('- '))
        elif current_section == 'instructions':
            if result['instructions']:
                result['instructions'] += '\n'
            result['instructions'] += line
            
    return result

def format_error_message(error: Exception, context: Optional[str] = None) -> str:
    """Format error message for logging"""
    if context:
        return f"{context}: {str(error)}"
    return str(error) 