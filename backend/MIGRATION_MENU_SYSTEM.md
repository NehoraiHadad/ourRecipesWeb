# Migration: Menu System Tables

## Summary
This migration adds support for the AI-powered menu planning system by creating 4 new database tables:

1. **menus** - Main menu records with event details
2. **menu_meals** - Individual meals within a menu (e.g., Friday Dinner, Saturday Breakfast)
3. **meal_recipes** - Recipes assigned to each meal with course information
4. **shopping_list_items** - Auto-generated shopping lists from menu recipes

## Why This Migration is Needed

The menu system code has been deployed, but the database tables don't exist yet. This means:
- ❌ Created menus are not being saved
- ❌ Users cannot see their menus (empty list)
- ❌ Menu generation appears to work but data is lost

## How to Apply This Migration

### Option 1: Using Flask-Migrate (Recommended)

```bash
cd backend
source venv/bin/activate  # or your virtual environment

# Check current migration status
flask db current

# Apply the migration
flask db upgrade

# Verify it worked
flask db current  # Should show 'add_menu_system'
```

### Option 2: Using Alembic Directly

```bash
cd backend/ourRecipesBack

# Check current status
alembic current

# Apply migration
alembic upgrade head

# Verify
alembic current
```

### Option 3: Manual SQL (if migrations don't work)

If the above methods fail, you can apply the migration manually:

```bash
# Connect to your database
psql -U your_username -d your_database_name

# Run the SQL from the migration file
# (see the upgrade() function in add_menu_system_tables.py)
```

## Verification

After applying the migration, verify the tables exist:

```sql
-- Check tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%menu%';

-- Should return:
-- menus
-- menu_meals
-- meal_recipes
-- shopping_list_items
```

## What to Do on Render/Production

### On Render:

1. Go to your backend service dashboard
2. Open the "Shell" tab
3. Run:
   ```bash
   flask db upgrade
   ```
4. Check logs to verify success

### On Heroku/Other Platforms:

```bash
heroku run flask db upgrade -a your-app-name
```

## Troubleshooting

### "relation already exists" error
If tables already exist (partial migration), you may need to:
1. Check which tables exist: `\dt menu*` in psql
2. Drop incomplete tables manually
3. Re-run migration

### "down_revision not found" error
Make sure all previous migrations have been applied:
```bash
flask db upgrade
```

## Files Changed

- `backend/ourRecipesBack/migrations/versions/add_menu_system_tables.py` - New migration file
- `backend/ourRecipesBack/models/menu.py` - Menu models (already exists)
- `backend/ourRecipesBack/models/shopping_list.py` - Shopping list model (already exists)

## After Migration

Once the migration is applied, users will be able to:
- ✅ Create and save menus
- ✅ View their saved menus
- ✅ See all meals and recipes in each menu
- ✅ Generate and view shopping lists
- ✅ Replace recipes in existing menus

The menu system will be fully functional!
