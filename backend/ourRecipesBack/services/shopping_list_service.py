import re
from ..extensions import db
from ..models import Menu, ShoppingListItem, Recipe


class ShoppingListService:
    """Service for generating and managing shopping lists from menus"""

    # Ingredient categories for organization
    CATEGORIES = {
        'vegetables': {
            'name': 'ירקות',
            'keywords': ['עגבניה', 'מלפפון', 'בצל', 'שום', 'פלפל', 'חסה', 'גזר', 'תפוח אדמה',
                        'בטטה', 'כרוב', 'ברוקולי', 'כרובית', 'קישוא', 'חציל', 'פטרוזיליה',
                        'כוסברה', 'נענע', 'בזיליקום', 'שמיר', 'ירקות']
        },
        'meat_fish': {
            'name': 'בשר ודגים',
            'keywords': ['בשר', 'עוף', 'כבש', 'הודו', 'דג', 'פילה', 'שניצל', 'קציצות',
                        'נקניק', 'סטייק', 'צלי', 'כתף', 'שוק', 'סלמון', 'טונה', 'דניס']
        },
        'dairy': {
            'name': 'מוצרי חלב',
            'keywords': ['חלב', 'גבינה', 'קוטג', 'שמנת', 'יוגורט', 'חמאה', 'ריקוטה',
                        'משק', 'מוצרלה', 'פרמזן', 'פטה', 'לבן', 'שמנת חמוצה']
        },
        'grains': {
            'name': 'דגנים ואפייה',
            'keywords': ['קמח', 'אורז', 'פסטה', 'קוסקוס', 'בורגול', 'לחם', 'פיתה',
                        'שמרים', 'אבקת אפייה', 'סוכר', 'ספגטי', 'לזניה', 'פחמימות']
        },
        'canned': {
            'name': 'שימורים ומוכנים',
            'keywords': ['רסק', 'קופסה', 'שימורים', 'חומוס', 'טחינה', 'ממרח', 'כבוש',
                        'זיתים', 'קורנפלקס', 'מרק', 'מרקם']
        },
        'spices': {
            'name': 'תבלינים ורטבים',
            'keywords': ['מלח', 'פלפל', 'כמון', 'כורכום', 'פפריקה', 'קארי', 'קינמון',
                        'סומק', 'אורגנו', 'טימין', 'רוזמרין', 'שמן', 'חומץ', 'רוטב',
                        'קטשופ', 'מיונז', 'חרדל', 'סויה', 'דבש', 'סילאן', 'תבלין']
        },
        'fruits': {
            'name': 'פירות',
            'keywords': ['תפוח', 'בננה', 'תפוז', 'לימון', 'אשכולית', 'אבוקדו', 'ענבים',
                        'תות', 'אפרסק', 'שזיף', 'אגס', 'מנגו', 'אננס', 'רימון', 'פרי']
        },
        'frozen': {
            'name': 'קפואים',
            'keywords': ['קפוא', 'גלידה', 'ירקות קפואים', 'פירות קפואים']
        },
        'other': {
            'name': 'מוצרי יסוד',
            'keywords': []  # Default category
        }
    }

    @classmethod
    def generate_shopping_list(cls, menu_id):
        """
        Generate shopping list from menu recipes

        Args:
            menu_id: ID of the menu

        Returns:
            dict: Shopping list organized by categories
        """
        try:
            menu = Menu.query.get(menu_id)
            if not menu:
                raise Exception("Menu not found")

            # Clear existing shopping list items
            ShoppingListItem.query.filter_by(menu_id=menu_id).delete()

            # Collect all ingredients from all recipes in the menu
            ingredients_map = {}  # {ingredient_name: [quantities]}

            for meal in menu.meals:
                for meal_recipe in meal.recipes:
                    recipe = meal_recipe.recipe
                    if not recipe:
                        continue

                    # Parse ingredients
                    ingredients = cls._extract_ingredients(recipe, meal_recipe.servings)

                    for ingredient_data in ingredients:
                        name = ingredient_data['name']
                        quantity = ingredient_data['quantity']

                        if name not in ingredients_map:
                            ingredients_map[name] = []
                        ingredients_map[name].append(quantity)

            # Create shopping list items
            shopping_list = {}

            for ingredient_name, quantities in ingredients_map.items():
                # Categorize ingredient
                category = cls._categorize_ingredient(ingredient_name)

                # Aggregate quantities (simple version - can be enhanced)
                aggregated_quantity = cls._aggregate_quantities(quantities)

                # Create shopping list item
                item = ShoppingListItem(
                    menu_id=menu_id,
                    ingredient_name=ingredient_name,
                    quantity=aggregated_quantity,
                    category=category
                )

                db.session.add(item)

                # Add to result dict
                if category not in shopping_list:
                    shopping_list[category] = []
                shopping_list[category].append({
                    'name': ingredient_name,
                    'quantity': aggregated_quantity
                })

            db.session.commit()

            return shopping_list

        except Exception as e:
            db.session.rollback()
            print(f"Error generating shopping list: {str(e)}")
            raise

    @classmethod
    def _extract_ingredients(cls, recipe, servings=None):
        """
        Extract ingredients from a recipe

        Args:
            recipe: Recipe object
            servings: Override servings (for scaling)

        Returns:
            list: List of ingredient dictionaries
        """
        ingredients = []

        # Get ingredients list
        raw_ingredients = recipe.ingredients  # This returns list from property

        if not raw_ingredients:
            return ingredients

        for ingredient_line in raw_ingredients:
            if not ingredient_line or ingredient_line.strip() == '':
                continue

            # Parse ingredient line
            parsed = cls._parse_ingredient_line(ingredient_line)

            if parsed:
                # Scale quantity if servings override is provided
                if servings and recipe.servings and servings != recipe.servings:
                    parsed['quantity'] = cls._scale_quantity(
                        parsed['quantity'],
                        recipe.servings,
                        servings
                    )

                ingredients.append(parsed)

        return ingredients

    @classmethod
    def _parse_ingredient_line(cls, line):
        """
        Parse an ingredient line to extract name and quantity

        Args:
            line: Ingredient line string (e.g., "2 כוסות קמח")

        Returns:
            dict: {name, quantity} or None
        """
        # Remove leading dash/bullet
        line = re.sub(r'^[\s\-\*•]+', '', line).strip()

        if not line:
            return None

        # Try to extract quantity and name
        # Patterns: "2 כוסות קמח", "קמח - 2 כוסות", "500 גרם בשר"
        quantity_pattern = r'(\d+(?:[.,]\d+)?)\s*([א-ת\w\s]*?)\s+([א-ת\s]+)'

        match = re.match(quantity_pattern, line)

        if match:
            amount = match.group(1)
            unit = match.group(2).strip()
            name = match.group(3).strip()

            quantity = f"{amount} {unit}".strip()
            return {
                'name': name,
                'quantity': quantity
            }
        else:
            # No clear quantity found, treat whole line as ingredient name
            return {
                'name': line,
                'quantity': 'לפי הצורך'
            }

    @classmethod
    def _categorize_ingredient(cls, ingredient_name):
        """
        Categorize an ingredient based on keywords

        Args:
            ingredient_name: Name of the ingredient

        Returns:
            str: Category name
        """
        ingredient_lower = ingredient_name.lower()

        for category_key, category_data in cls.CATEGORIES.items():
            for keyword in category_data['keywords']:
                if keyword in ingredient_lower:
                    return category_data['name']

        # Default to 'other'
        return cls.CATEGORIES['other']['name']

    @classmethod
    def _aggregate_quantities(cls, quantities):
        """
        Aggregate multiple quantities into a single string

        Args:
            quantities: List of quantity strings

        Returns:
            str: Aggregated quantity string
        """
        if not quantities:
            return 'לפי הצורך'

        if len(quantities) == 1:
            return quantities[0]

        # For now, simple approach: list all quantities
        # Future: could parse and sum numeric values
        unique_quantities = list(set(quantities))

        if len(unique_quantities) == 1:
            return unique_quantities[0]

        # Multiple different quantities - show sum or list
        return ' + '.join(unique_quantities)

    @classmethod
    def _scale_quantity(cls, quantity, original_servings, new_servings):
        """
        Scale a quantity based on servings

        Args:
            quantity: Original quantity string
            original_servings: Original number of servings
            new_servings: New number of servings

        Returns:
            str: Scaled quantity string
        """
        if not quantity or original_servings == new_servings:
            return quantity

        try:
            # Extract numeric value
            match = re.match(r'(\d+(?:[.,]\d+)?)\s*(.*)', quantity)
            if match:
                amount = float(match.group(1).replace(',', '.'))
                unit = match.group(2)

                # Calculate scaled amount
                scale_factor = new_servings / original_servings
                scaled_amount = amount * scale_factor

                # Format nicely
                if scaled_amount.is_integer():
                    return f"{int(scaled_amount)} {unit}".strip()
                else:
                    return f"{scaled_amount:.1f} {unit}".strip()

        except Exception:
            pass

        # If parsing fails, return original
        return quantity

    @classmethod
    def get_shopping_list(cls, menu_id):
        """
        Get existing shopping list for a menu

        Args:
            menu_id: ID of the menu

        Returns:
            dict: Shopping list organized by categories
        """
        items = ShoppingListItem.query.filter_by(menu_id=menu_id).all()

        shopping_list = {}
        for item in items:
            category = item.category
            if category not in shopping_list:
                shopping_list[category] = []

            shopping_list[category].append(item.to_dict())

        return shopping_list

    @classmethod
    def update_item_status(cls, item_id, is_checked):
        """
        Update shopping list item checked status

        Args:
            item_id: ID of the shopping list item
            is_checked: New checked status

        Returns:
            ShoppingListItem: Updated item
        """
        item = ShoppingListItem.query.get(item_id)
        if not item:
            raise Exception("Shopping list item not found")

        item.is_checked = is_checked
        db.session.commit()

        return item
