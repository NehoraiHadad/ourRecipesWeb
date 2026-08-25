/**
 * AI Service facade.
 *
 * Text tasks (suggestion / reformat / refine / optimize-steps) live in
 * `src/lib/ai/gemini/textTasks.ts`; image tasks (recipe photo / infographic)
 * live in `src/lib/ai/imageTasks.ts` (KIE, with a direct-Gemini fallback for
 * infographics). Both are re-exported here unchanged so routes and existing
 * test mocks (`vi.mock('@/lib/services/aiService', ...)`) keep working.
 */
export {
  generateRecipeSuggestion,
  reformatRecipe,
  refineRecipe,
  optimizeRecipeSteps
} from '@/lib/ai/gemini/textTasks';

export { generateRecipeImage, generateRecipeInfographic } from '@/lib/ai/imageTasks';
