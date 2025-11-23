/**
 * Mock data for tests
 */
import {
  Recipe,
  Menu,
  RecipeDifficulty,
  DietaryType
} from '@prisma/client';

/**
 * Mock recipe
 */
export const mockRecipe: Recipe = {
  id: 1,
  telegram_id: 12345,
  title: 'Test Recipe',
  raw_content: 'Test content',
  ingredients: 'flour||eggs||milk',
  instructions: 'Mix and bake',
  categories: 'dessert,baking',
  recipe_metadata: null,
  image_data: null,
  image_url: 'https://example.com/image.jpg',
  media_type: 'photo',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  last_sync: null,
  is_parsed: true,
  parse_errors: null,
  status: 'active',
  ingredients_list: [
    { name: 'flour', amount: '2', unit: 'cups' },
    { name: 'eggs', amount: '3', unit: 'pieces' }
  ],
  cooking_time: 30,
  difficulty: RecipeDifficulty.EASY,
  servings: 4,
  preparation_time: 15,
  formatted_content: null,
  is_verified: false,
  sync_status: 'synced',
  sync_error: null
};

/**
 * Mock menu
 */
export const mockMenu: Menu = {
  id: 1,
  user_id: 'user123',
  telegram_message_id: 67890,
  last_sync: null,
  name: 'Shabbat Menu',
  event_type: 'shabbat',
  description: 'Traditional Shabbat dinner',
  total_servings: 6,
  dietary_type: DietaryType.MEAT,
  share_token: 'abc123xyz',
  is_public: false,
  ai_reasoning: null,
  generation_prompt: null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01')
};

/**
 * Create mock recipe with overrides
 */
export function createMockRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    ...mockRecipe,
    ...overrides
  };
}

/**
 * Create mock menu with overrides
 */
export function createMockMenu(overrides: Partial<Menu> = {}): Menu {
  return {
    ...mockMenu,
    ...overrides
  };
}

/**
 * Create array of mock recipes
 */
export function createMockRecipes(count: number): Recipe[] {
  return Array.from({ length: count }, (_, i) =>
    createMockRecipe({
      id: i + 1,
      telegram_id: 10000 + i,
      title: `Recipe ${i + 1}`
    })
  );
}
