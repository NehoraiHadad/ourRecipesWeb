# Menu Planning System

## Overview

A comprehensive AI-powered menu planning system that helps users create complete meal plans for events (Shabbat, holidays, family gatherings) with intelligent recipe selection, shopping list generation, and kosher dietary compliance.

## Features

### 🤖 AI-Powered Menu Generation
- **Smart Recipe Selection**: AI analyzes available recipes and selects appropriate dishes based on:
  - Event type (Shabbat, holiday, family dinner)
  - Number of servings
  - Dietary restrictions (meat/dairy/pareve for kosher compliance)
  - Course types (appetizers, mains, sides, desserts)
  - Cooking times and complexity balance
  - Flavor and texture variety

- **Pre-filtering Strategy**: Instead of sending all recipes to AI (which would be expensive and slow), the system:
  1. Pre-filters recipes by dietary type from database
  2. Categorizes recipes by course type (salads, soups, mains, sides, desserts)
  3. Sends only essential metadata to AI (title, categories, cooking time, difficulty)
  4. AI selects from this curated list to create a balanced menu

### 📋 Menu Management
- **Create Menus**: Generate complete menus for multiple meals (e.g., Friday dinner, Saturday breakfast, third meal)
- **Edit Menus**: Replace individual recipes with AI-powered suggestions
- **View Menus**: Beautiful display with meal organization and recipe details
- **Delete Menus**: Full CRUD operations
- **Share Menus**: Generate public share links for menu sharing

### 🛒 Shopping List Generation
- **Automatic Generation**: Creates shopping lists from all recipes in menu
- **Smart Categorization**: Organizes ingredients by category:
  - 🥬 Vegetables
  - 🥩 Meat and Fish
  - 🥛 Dairy Products
  - 🌾 Grains and Baking
  - 🥫 Canned and Prepared Foods
  - 🧂 Spices and Sauces
  - 🍎 Fruits
  - 🧊 Frozen Items
  - 🛒 Staples

- **Quantity Aggregation**: Combines quantities from multiple recipes
- **Check/Uncheck Items**: Track shopping progress
- **Progress Tracking**: Visual progress bar showing completion
- **Export Options**: Copy as text, print functionality
- **Future Integration**: Ready for Google Keep synchronization

### ✅ Kosher Compliance
- **Dietary Types**:
  - Meat (בשרי)
  - Dairy (חלבי)
  - Pareve (פרווה)
- **Automatic Validation**: AI ensures no mixing of meat and dairy in same meal
- **Smart Filtering**: Only shows appropriate recipes for selected dietary type

## Technical Architecture

### Backend (Python/Flask)

#### Models
Located in `/backend/ourRecipesBack/models/`:

1. **Menu** (`menu.py`)
   - Main menu entity
   - Links to user, stores event details
   - Share token for public sharing
   - AI reasoning field

2. **MenuMeal** (`menu.py`)
   - Individual meal within menu
   - Meal type (e.g., "Friday dinner")
   - Order and optional time

3. **MealRecipe** (`menu.py`)
   - Links recipes to meals
   - Course type and order
   - Servings override
   - AI reasoning for selection

4. **ShoppingListItem** (`shopping_list.py`)
   - Individual shopping list items
   - Ingredient name, quantity, category
   - Check/uncheck status

5. **Enums** (`enums.py`)
   - `DietaryType`: meat/dairy/pareve
   - `CourseType`: appetizer/main/side/dessert/salad/soup

#### Services

1. **MenuPlannerService** (`services/menu_planner_service.py`) - **🆕 UPGRADED TO FUNCTION CALLING**
   - **`generate_menu()`**: AI-powered menu generation with dynamic function calling
   - **`_get_search_tools()`**: Defines AI tools (search_recipes, get_recipe_details)
   - **`_execute_search_recipes()`**: Executes AI's dynamic recipe searches
   - **`_execute_get_recipe_details()`**: Fetches specific recipe details
   - **`_create_menu_from_plan()`**: Saves AI's menu to database
   - **`suggest_recipe_replacement()`**: Find alternative recipes

   **Function Calling Features:**
   - AI searches recipes dynamically (multiple searches per menu)
   - Filters: dietary_type, course_type, max_cooking_time, difficulty, exclude_ids
   - Multi-turn conversation (up to 10 iterations)
   - Uses Gemini 2.0 Flash (latest model)
   - See `FUNCTION_CALLING_UPGRADE.md` for details

2. **ShoppingListService** (`services/shopping_list_service.py`)
   - `generate_shopping_list()`: Create list from menu recipes
   - `_extract_ingredients()`: Parse recipe ingredients
   - `_categorize_ingredient()`: Assign category by keywords
   - `_aggregate_quantities()`: Combine duplicate ingredients
   - `_scale_quantity()`: Adjust for serving size
   - `update_item_status()`: Check/uncheck items

#### API Routes
Located in `/backend/ourRecipesBack/routes/menus.py`:

```
POST   /api/menus/generate                                  - Generate new menu
GET    /api/menus                                           - List user menus
GET    /api/menus/<id>                                      - Get menu details
GET    /api/menus/shared/<token>                            - Get shared menu (public)
PUT    /api/menus/<id>                                      - Update menu
DELETE /api/menus/<id>                                      - Delete menu
PUT    /api/menus/<id>/meals/<mid>/recipes/<rid>           - Replace recipe
GET    /api/menus/<id>/meals/<mid>/recipes/<rid>/suggestions - Get recipe alternatives
GET    /api/menus/<id>/shopping-list                        - Get shopping list
POST   /api/menus/<id>/shopping-list/regenerate            - Regenerate shopping list
PATCH  /api/menus/shopping-list/items/<id>                 - Update item status
```

### Frontend (Next.js/React/TypeScript)

#### Types
Located in `/frontend/ourRecipesFront/src/types/index.ts`:

- `Menu`: Complete menu structure
- `MenuMeal`: Meal within menu
- `MealRecipe`: Recipe in meal context
- `RecipeSummary`: Minimal recipe data
- `ShoppingList`: Categorized shopping items
- `MenuGenerationRequest`: AI generation parameters

#### Services
Located in `/frontend/ourRecipesFront/src/services/menuService.ts`:

- Menu CRUD operations
- Recipe replacement
- Shopping list management
- Share link utilities

#### Components
Located in `/frontend/ourRecipesFront/src/components/`:

1. **MenuGenerator.tsx**
   - Form for creating new menus
   - Event type, servings, dietary type selection
   - Multiple meal type selection
   - Special requests input
   - Loading states with AI feedback

2. **MenuDisplay.tsx**
   - Displays complete menu with all meals
   - Recipe cards with images and details
   - Replace recipe modal with suggestions
   - Share toggle and link copying
   - Delete functionality
   - Shows AI reasoning

3. **ShoppingListDisplay.tsx**
   - Categorized ingredient display
   - Check/uncheck items
   - Progress tracking
   - Regenerate, export, print functions
   - Category icons

#### Pages
Located in `/frontend/ourRecipesFront/src/app/(main)/menus/`:

```
/menus                      - List all user menus
/menus/new                  - Create new menu
/menus/[id]                 - View/edit menu
/menus/[id]/shopping-list   - Shopping list for menu
/menus/shared/[token]       - Public shared menu view
```

## Usage Flow

### Creating a Menu

1. Navigate to `/menus/new`
2. Fill in menu details:
   - Name (required)
   - Event type (Shabbat, holiday, etc.)
   - Number of servings
   - Dietary type (optional)
   - Select meal types (required - at least one)
   - Special requests (optional)
3. Click "צור תפריט" (Create Menu)
4. AI generates complete menu with recipes
5. Automatic shopping list is created
6. Redirected to menu view

### Editing a Menu

1. Open menu from `/menus` list
2. Click on any recipe card
3. View AI-suggested alternatives
4. Click on replacement recipe
5. Menu updates, shopping list regenerates automatically

### Sharing a Menu

1. Open menu
2. Click "🔓 שותף" to make public
3. Click "📋 העתק קישור" to copy share link
4. Share link with anyone (no login required)

### Using Shopping List

1. From menu view, click "📝 רשימת קניות"
2. See categorized ingredients
3. Check off items as you shop
4. Track progress with progress bar
5. Export or print as needed

## AI Integration

### 🆕 Gemini 2.0 Flash with Function Calling

The system uses Google's **Gemini 2.0 Flash (Experimental)** with **Function Calling** for intelligent, dynamic menu planning.

**How It Works:**

Instead of sending all recipes upfront, the AI **searches dynamically** using tools:

```python
# AI has access to these tools:
1. search_recipes(dietary_type, course_type, max_cooking_time, difficulty, limit, exclude_ids)
2. get_recipe_details(recipe_id)
```

**System Prompt**:
- Expert chef and meal planner specializing in kosher cuisine
- Enforces: kosher laws, balance, timing, appropriateness, practicality
- **NEW:** Instructions on how to use search tools strategically

**Workflow**:
```
1. User: "Create a Shabbat menu for 8 people, meat-based"
2. AI: "I'll search for appropriate recipes"
   → calls search_recipes(course="salad", limit=5)
   → receives 5 salad options
3. AI: "Now I need main courses"
   → calls search_recipes(course="main", dietary="meat", limit=5)
   → receives 5 meat dishes
4. AI: "I need desserts, avoiding previous selections"
   → calls search_recipes(course="dessert", exclude_ids=[123,456], limit=3)
   → receives 3 desserts
5. AI: "Menu is complete, here's the final plan"
   → returns JSON with selected recipes
```

**Response Format** (unchanged):
```json
{
  "meals": [
    {
      "meal_type": "ארוחת ערב שבת",
      "meal_order": 1,
      "recipes": [
        {
          "recipe_id": 123,
          "course_type": "salad",
          "course_order": 1,
          "reason": "Light and refreshing to start the meal"
        }
      ]
    }
  ],
  "reasoning": "This menu balances rich meat dishes with light salads..."
}
```

## Database Schema

### Tables Created

```sql
CREATE TABLE menus (
    id INTEGER PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    event_type VARCHAR(100),
    description TEXT,
    total_servings INTEGER DEFAULT 4,
    dietary_type ENUM('meat', 'dairy', 'pareve'),
    share_token VARCHAR(32) UNIQUE,
    is_public BOOLEAN DEFAULT FALSE,
    ai_reasoning TEXT,
    generation_prompt TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE menu_meals (
    id INTEGER PRIMARY KEY,
    menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    meal_type VARCHAR(100) NOT NULL,
    meal_order INTEGER NOT NULL,
    meal_time VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE meal_recipes (
    id INTEGER PRIMARY KEY,
    menu_meal_id INTEGER NOT NULL REFERENCES menu_meals(id) ON DELETE CASCADE,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    course_type VARCHAR(100),
    course_order INTEGER DEFAULT 0,
    servings INTEGER,
    notes TEXT,
    ai_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shopping_list_items (
    id INTEGER PRIMARY KEY,
    menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    ingredient_name VARCHAR(200) NOT NULL,
    quantity VARCHAR(100),
    category VARCHAR(100),
    is_checked BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Indexes

- `idx_user_recipe` on menus(user_id)
- `idx_menu_meal` on menu_meals(menu_id, meal_order)
- `idx_meal_recipe` on meal_recipes(menu_meal_id, recipe_id)
- `idx_menu_shopping` on shopping_list_items(menu_id, category)

## Setup & Installation

### Backend Setup

1. Database will auto-create tables on first run:
   ```python
   # In __init__.py, db.create_all() creates tables
   with app.app_context():
       db.create_all()
   ```

2. Ensure Google API key is configured:
   ```env
   GOOGLE_API_KEY=your_gemini_api_key
   ```

3. Import new models in `models/__init__.py`:
   ```python
   from .menu import Menu, MenuMeal, MealRecipe
   from .shopping_list import ShoppingListItem
   ```

4. Register blueprint in `__init__.py`:
   ```python
   from .routes.menus import menus_bp
   app.register_blueprint(menus_bp, url_prefix='/api/menus')
   ```

### Frontend Setup

No additional setup required. New routes are automatically handled by Next.js file-based routing.

## Future Enhancements

### Planned Features

1. **Google Keep Integration**
   - Auto-sync shopping lists to Google Keep
   - Real-time updates
   - Category-based list organization

2. **Meal Templates**
   - Save menus as reusable templates
   - Community template sharing
   - Template marketplace

3. **Nutritional Information**
   - Calorie tracking
   - Macronutrient breakdown
   - Dietary restrictions support

4. **Advanced AI Features**
   - Learn from user preferences
   - Seasonal ingredient suggestions
   - Budget-conscious meal planning
   - Leftover management

5. **Calendar Integration**
   - Schedule menus on calendar
   - Recurring menu patterns
   - Holiday auto-suggestions

6. **Collaboration**
   - Shared family menus
   - Cooking task assignment
   - Real-time editing

## Testing

### Manual Testing Checklist

#### Menu Generation
- [ ] Create menu with all fields
- [ ] Create menu with minimal fields
- [ ] Verify AI generates balanced menu
- [ ] Check kosher compliance (no meat+dairy mixing)
- [ ] Test with different dietary types
- [ ] Test with multiple meal types

#### Menu Management
- [ ] View menu list
- [ ] View single menu details
- [ ] Replace recipe with suggestion
- [ ] Update menu details
- [ ] Delete menu
- [ ] Share menu (toggle public)
- [ ] Copy share link
- [ ] View shared menu without auth

#### Shopping List
- [ ] Generate shopping list from menu
- [ ] Verify categories are correct
- [ ] Check/uncheck items
- [ ] Progress tracking updates
- [ ] Regenerate list
- [ ] Export as text
- [ ] Print functionality

## Performance Considerations

### Backend
- **Recipe Pre-filtering**: Limits recipes sent to AI (~100 max)
- **Metadata Only**: Sends only essential fields to AI
- **Database Indexes**: Fast lookups for menu queries
- **Cascade Deletes**: Efficient cleanup

### Frontend
- **Lazy Loading**: Shopping list loads on-demand
- **Optimistic Updates**: UI updates before server response
- **Caching**: Menu data cached client-side
- **Skeleton Loading**: Better perceived performance

## Security

- **Authentication**: All menu routes require JWT auth (except shared views)
- **Authorization**: Users can only access their own menus
- **Share Tokens**: 24-character secure random tokens
- **Public Sharing**: Explicit opt-in for menu sharing
- **Input Validation**: All inputs validated before AI processing
- **SQL Injection**: Protected by SQLAlchemy ORM

## Code Comments

All code is in **English** with comments in **English**.
Only UI text and user-facing strings are in **Hebrew**.

## Contributing

When extending this system:

1. **Follow Existing Patterns**:
   - Backend: Flask Blueprint → Service → Model
   - Frontend: Page → Component → Service → API

2. **Add Types** (TypeScript):
   - Define interfaces in `types/index.ts`
   - Use strict typing

3. **Document AI Prompts**:
   - Explain prompt structure
   - Document expected responses

4. **Test Kosher Compliance**:
   - Never mix meat and dairy
   - Test edge cases

5. **Maintain Hebrew UI**:
   - All user-facing text in Hebrew
   - RTL support
   - Clear, concise labels

---

## 🆕 Recent Upgrade: Function Calling (January 2025)

The menu planning system was upgraded from static pre-filtering to **dynamic Function Calling**.

**What Changed:**
- AI now searches recipes dynamically instead of receiving a fixed list
- Multiple targeted searches per menu (more intelligent)
- Better handling of constraints and duplicates
- Upgraded to Gemini 2.0 Flash (latest model)

**Benefits:**
- ⚡ More efficient (fewer tokens)
- 🎯 Smarter recipe selection
- 📈 Scales to thousands of recipes
- 🔄 Self-correcting (AI can search again if needed)

**See:** `FUNCTION_CALLING_UPGRADE.md` for full technical details.

---

**Built with ❤️ using AI-powered meal planning**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
