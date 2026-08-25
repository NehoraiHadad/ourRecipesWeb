import { describe, it, expect } from 'vitest';
import { planRecipeBackfill, type BackfillSourceRow } from '@/lib/recipes/backfillTransform';

function row(overrides: Partial<BackfillSourceRow> = {}): BackfillSourceRow {
  return { id: 1, telegram_id: 100, raw_content: '', is_parsed: false, ...overrides };
}

const STRUCTURED_TEXT = [
  'כותרת: עוגת שוקולד',
  'קטגוריות: קינוחים',
  'זמן הכנה: 45 דקות',
  'רמת קושי: קל',
  'רשימת מצרכים:',
  '- 200 גרם שוקולד',
  '- 3 ביצים',
  'הוראות הכנה:',
  'ממיסים ומקפלים.'
].join('\n');

describe('planRecipeBackfill', () => {
  it('returns null for a blank raw_content — nothing to re-parse', () => {
    expect(planRecipeBackfill(row({ raw_content: '   ' }))).toBeNull();
    expect(planRecipeBackfill(row({ raw_content: '' }))).toBeNull();
  });

  it('parses a fully structured recipe into ingredients_list and is_parsed: true', () => {
    const plan = planRecipeBackfill(row({ raw_content: STRUCTURED_TEXT, is_parsed: false }));

    expect(plan).not.toBeNull();
    expect(plan!.willBeParsed).toBe(true);
    expect(plan!.wasParsed).toBe(false);
    expect(plan!.ingredientCount).toBe(2);
    expect(plan!.fields.ingredients_list).toEqual([
      { quantity: 200, unit: 'גרם', name: 'שוקולד' },
      { quantity: 3, name: 'ביצים' }
    ]);
    expect(plan!.fields.title).toBe('עוגת שוקולד');
    expect(plan!.fields.categories).toBe('קינוחים');
    expect(plan!.fields.preparation_time).toBe(45);
    expect(plan!.fields.difficulty).toBe('EASY');
  });

  it('best-effort parses free text with no recognised sections — is_parsed: false, empty ingredients', () => {
    const plan = planRecipeBackfill(
      row({ raw_content: 'עוגת שוקולד של סבתא, שוקולד וביצים, לערבב ולאפות', is_parsed: false })
    );

    expect(plan).not.toBeNull();
    expect(plan!.willBeParsed).toBe(false);
    expect(plan!.ingredientCount).toBe(0);
    expect(plan!.fields.ingredients_list).toEqual([]);
  });

  it('strips the 🗑️ archive marker before parsing, matching ingestRecipeMessage', () => {
    const plan = planRecipeBackfill(row({ raw_content: `🗑️ ${STRUCTURED_TEXT}`, is_parsed: true }));

    expect(plan).not.toBeNull();
    expect(plan!.fields.title).toBe('עוגת שוקולד');
    expect(plan!.willBeParsed).toBe(true);
    expect(plan!.ingredientCount).toBe(2);
  });

  it('flags a parsed -> unparsed regression', () => {
    const plan = planRecipeBackfill(row({ raw_content: 'טקסט חופשי בלבד', is_parsed: true }));

    expect(plan!.wasParsed).toBe(true);
    expect(plan!.willBeParsed).toBe(false);
  });
});
