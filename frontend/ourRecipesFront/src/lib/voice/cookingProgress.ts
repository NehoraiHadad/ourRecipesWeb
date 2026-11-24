import { isProgress, type ActiveRecipe, type Progress } from './compactEngine';
import type { Portions } from './ingredientConversation';

type States = Record<string, Progress>;
type Change = { action: string; status: Progress };

export function readCookingProgress(recipe: ActiveRecipe, value: string | null) {
  let saved;
  try { saved = JSON.parse(value || '{}'); } catch { /* Discard unreadable browser data. */ }
  const progress: States = {};
  const portions: Portions = {};
  for (const { id } of [...recipe.actions, ...recipe.ingredients]) {
    progress[id] = isProgress(saved?.[id]) ? saved[id] : 'pending';
  }
  for (const { id } of recipe.ingredients) {
    const share = saved?.portions?.[id];
    if (progress[id] === 'partial' && typeof share === 'number' && share > 0 && share < 1) portions[id] = share;
  }
  return { progress, portions };
}

export function applyCookingChanges(progress: States, portions: Portions, writes: Change[], reported: Portions = {}) {
  const next = { ...progress };
  const amounts = { ...portions };
  for (const { action, status } of writes) {
    next[action] = status;
    delete amounts[action];
    if (status === 'partial' && reported[action] > 0 && reported[action] < 1) amounts[action] = reported[action];
  }
  return { progress: next, portions: amounts };
}
