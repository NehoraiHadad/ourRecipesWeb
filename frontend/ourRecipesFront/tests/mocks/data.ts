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
  instructions: 'Mix and bake',
  categories: 'dessert,baking',
  image_url: 'https://example.com/image.jpg',
  media_type: 'photo',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  last_sync: null,
  is_parsed: true,
  parse_errors: null,
  status: 'ACTIVE',
  ingredients_list: [
    { quantity: 2, unit: 'כוסות', name: 'קמח' },
    { quantity: 3, name: 'ביצים' }
  ],
  cooking_time: 30,
  difficulty: RecipeDifficulty.EASY,
  servings: 4,
  preparation_time: 15,
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
