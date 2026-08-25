/**
 * The menu-planning agent's data contract.
 *
 * `MenuPlan` is what `POST /api/menus/generate-preview` echoes to the client
 * and what `POST /api/menus` persists — the field names here ARE the wire
 * names. In particular the per-recipe justification is `ai_reason` end to end
 * (the pre-rewrite save route read `reason`, which the model never emitted, so
 * every saved menu lost its explanations).
 */

/** What the user asked for. Mirrors the generate-preview request body. */
export interface MenuPreferences {
  name: string;
  event_type?: string;
  servings: number;
  dietary_type?: string;
  meal_types: string[];
  special_requests?: string;
}

export interface PlannedRecipe {
  recipe_id: number;
  /** Hebrew course name — "ראשונה" / "עיקרית" / "תוספת" / "קינוח". */
  course_type: string;
  course_order: number;
  /** Why this recipe belongs here, in Hebrew. Persisted to `MealRecipe.ai_reason`. */
  ai_reason: string;
}

export interface MealPlan {
  meal_type: string;
  meal_order: number;
  recipes: PlannedRecipe[];
}

export interface MenuPlan {
  meals: MealPlan[];
  /** Menu-wide rationale, persisted to `Menu.ai_reasoning`. */
  reasoning: string;
}

/* ------------------------------------------------------------------ */
/* Tool payloads                                                       */
/* ------------------------------------------------------------------ */

export interface SearchRecipesArgs {
  query?: string;
  categories?: string[];
  max_total_time?: number;
  difficulty?: string;
  limit?: number;
}

/** Compact row the agent scans while shortlisting. */
export interface RecipeStub {
  id: number;
  title: string;
  categories: string | null;
  preparation_time: number | null;
  cooking_time: number | null;
  servings: number | null;
  difficulty: string | null;
}

/** Everything the agent needs to judge whether two dishes clash. */
export interface RecipeDetails extends RecipeStub {
  /** Ingredient NAMES only — quantities would multiply the token cost. */
  ingredients: string[];
  /** Truncated instructions; enough to tell a stew from a salad. */
  instructions_preview: string;
}

export interface DraftRecipe {
  recipe_id?: number;
  course_type?: string;
}

export interface DraftMeal {
  meal_type?: string;
  recipes?: DraftRecipe[];
}

export interface ReviewMenuDraftArgs {
  meals?: DraftMeal[];
}

/** Deterministic critique the agent iterates against. Issues are in Hebrew. */
export interface ReviewResult {
  ok: boolean;
  issues: string[];
}
