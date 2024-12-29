import { describe, it, expect } from 'vitest';
import { parseRecipe } from '../utils/formatChecker';

describe('Recipe Parser', () => {
  it('should correctly parse recipe with categories', () => {
    const recipeText = `כותרת: עוגת שוקולד
קטגוריות: קינוחים, אפייה
רשימת מצרכים:
- 2 ביצים
- כוס סוכר
הוראות הכנה:
1. לערבב הכל`;

    const result = parseRecipe(recipeText);
    expect(result.categories).toEqual(['קינוחים', 'אפייה']);
    expect(result.title).toBe('עוגת שוקולד');
    expect(result.ingredients).toContain('2 ביצים');
    expect(result.ingredients).toContain('כוס סוכר');
  });

  it('should handle recipes without categories', () => {
    const recipeText = `כותרת: עוגת שוקולד
רשימת מצרכים:
- 2 ביצים
הוראות הכנה:
1. לערבב הכל`;

    const result = parseRecipe(recipeText);
    expect(result.categories).toEqual([]);
    expect(result.title).toBe('עוגת שוקולד');
  });

  it('should handle empty or malformed recipes', () => {
    const emptyRecipe = '';
    expect(() => parseRecipe(emptyRecipe)).not.toThrow();
  });
}); 