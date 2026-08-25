/**
 * The ingredients list, rendered straight from the structured field
 * (STRUCTURE_REFACTOR_TASKS.md §D1) — no text is re-parsed in the browser.
 * Quantity + unit get their own span so the servings multiplier is visible at
 * a glance; tapping a line crosses it off while cooking.
 */
import React, { useEffect, useState } from 'react';
import type { StructuredIngredient } from '@/lib/serializers/recipeTypes';
import { scaleIngredientForDisplay } from '@/lib/recipes/servingsScale';

interface IngredientListViewProps {
  ingredients: StructuredIngredient[];
  /** Servings multiplier; 1 leaves every quantity exactly as written. */
  multiplier?: number;
}

const IngredientListView: React.FC<IngredientListViewProps> = ({
  ingredients,
  multiplier = 1
}) => {
  const [checked, setChecked] = useState<boolean[]>([]);

  useEffect(() => {
    setChecked(new Array(ingredients.length).fill(false));
  }, [ingredients]);

  if (ingredients.length === 0) return null;

  const toggle = (index: number) =>
    setChecked((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });

  return (
    <ul className="p-0">
      {ingredients.map((ingredient, index) => {
        const { measure, name, note } = scaleIngredientForDisplay(ingredient, multiplier);
        const isChecked = Boolean(checked[index]);

        return (
          <li
            key={index}
            onClick={() => toggle(index)}
            className="cursor-pointer hover:bg-gray-50 py-0.5 px-1 rounded-md transition-colors duration-150"
          >
            <span className="flex items-baseline gap-1.5">
              <span className="text-gray-400 select-none">{isChecked ? '✓' : '•'}</span>
              <span className={isChecked ? 'line-through text-gray-400' : ''}>
                {measure && (
                  <span
                    className={multiplier !== 1 ? 'text-primary-600 font-medium' : 'font-medium'}
                  >
                    {measure}{' '}
                  </span>
                )}
                {name}
                {note && <span className="text-gray-500"> ({note})</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
};

export default IngredientListView;
