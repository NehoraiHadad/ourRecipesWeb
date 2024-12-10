import { parseRecipe } from '../utils/formatChecker';

describe('parseRecipe', () => {
  it('should parse preparation time correctly', () => {
    const text = `כותרת: מתכון
זמן הכנה: 30 דקות
רשימת מצרכים:
- מצרך
הוראות הכנה:
1. צעד`;

    const result = parseRecipe(text);
    expect(result.preparation_time).toBe(30);
  });

  it('should parse difficulty correctly', () => {
    const text = `כותרת: מתכון
רמת קושי: קל
רשימת מצרכים:
- מצרך
הוראות הכנה:
1. צעד`;

    const result = parseRecipe(text);
    expect(result.difficulty).toBe('easy');
  });

  it('should handle missing or invalid values', () => {
    const text = `כותרת: מתכון
זמן הכנה: לא ידוע
רמת קושי: לא ידוע
רשימת מצרכים:
- מצרך
הוראות הכנה:
1. צעד`;

    const result = parseRecipe(text);
    expect(result.preparation_time).toBeUndefined();
    expect(result.difficulty).toBeUndefined();
  });
}); 