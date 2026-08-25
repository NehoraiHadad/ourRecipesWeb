---
name: our-recipes
description: Search the family recipe collection and build meal menus through the Our Recipes MCP server. Use when the user asks for recipes, meal ideas, Shabbat/holiday menus, or shopping lists from "המתכונים שלנו".
---

# Our Recipes — family recipe assistant

The `our-recipes` MCP server (https://recipes.nehoraihadad.com/api/mcp) exposes a
read-only view of the family recipe database. All content is Hebrew. Answer the
user in Hebrew unless they write in another language.

## Tools

- `search_recipes` — filters: `query` (free text over title + categories),
  `categories` (array, OR semantics — recipes in any of them), `difficulty`
  (`EASY` / `MEDIUM` / `HARD` — English enum, not Hebrew),
  `max_total_time` (minutes, prep + cook), `limit` (default 12, max 40).
  Returns compact rows: id, title, categories, times, difficulty, url.
- `get_recipe_details` — `recipe_ids` (1–25 ids from search results). Returns
  ingredients and an instructions preview per recipe.
- `list_categories` — every category with its recipe count, most common first.

## Workflow

1. Vague request ("משהו טעים לשבת") → call `list_categories` first to see what
   exists, then run 2–3 targeted `search_recipes` calls (e.g. עיקריות, תוספות,
   קינוחים) instead of one broad query.
2. Concrete request ("פסטה ברוטב עגבניות") → `search_recipes` with `query`
   directly.
3. Only fetch `get_recipe_details` for recipes you actually intend to present —
   the search rows are enough for browsing and menu composition.
4. Link every recipe you mention using the `url` field returned by the tools
   (the site itself requires login; the link is for family members who have it).

## Menu building

For a menu request (Shabbat, holiday, hosting):
- Cover the courses the user implies: ראשונות, עיקריות, תוספות, קינוחים.
- Respect kashrut composition if stated (בשרי ↔ no dairy desserts; suggest פרווה).
- Balance effort — not every course should be מורכב; use `max_total_time` when
  the user is short on time.
- For a shopping list, fetch details for the chosen recipes and merge duplicate
  ingredients with summed quantities.

## Limits

- Read-only: you cannot create, edit or delete recipes. If asked, say changes
  are made in the app itself.
- Empty search? Retry with fewer filters or a shorter query before concluding
  the recipe does not exist — titles are Hebrew and often colloquial.
