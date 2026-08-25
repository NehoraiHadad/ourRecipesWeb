/**
 * Gemini text tasks: recipe suggestion, reformat, refine, step optimization.
 *
 * Re-exported (unchanged names/signatures) from `src/lib/services/aiService.ts`
 * so routes and existing test mocks keep working. Migrated off the retired
 * `gemini-2.0-flash-exp` onto `GEMINI_TEXT_MODEL` via the retrying wrapper in
 * `./generate`.
 */
import { logger } from '@/lib/logger';
import { OPTIMIZED_STEPS_SCHEMA } from '@/lib/recipes/optimizedSteps';
import { generateText, generateJson } from './generate';
import { GEMINI_TEXT_MODEL } from './models';
import {
  buildSuggestionPrompt,
  buildReformatPrompt,
  buildRefinePrompt,
  buildOptimizeStepsPrompt,
  type RecipeSuggestionParams
} from './prompts';

export async function generateRecipeSuggestion(params: RecipeSuggestionParams): Promise<string> {
  logger.debug(params, 'Generating recipe suggestion');

  const text = await generateText({ model: GEMINI_TEXT_MODEL, prompt: buildSuggestionPrompt(params) });

  logger.info('Recipe suggestion generated');
  return text;
}

export async function reformatRecipe(text: string): Promise<string> {
  logger.debug({ textLength: text.length }, 'Reformatting recipe');

  const result = await generateText({ model: GEMINI_TEXT_MODEL, prompt: buildReformatPrompt(text) });

  logger.info('Recipe reformatted');
  return result;
}

export async function refineRecipe(recipeText: string, refinementRequest: string): Promise<string> {
  logger.debug({ refinementRequest }, 'Refining recipe');

  const result = await generateText({
    model: GEMINI_TEXT_MODEL,
    prompt: buildRefinePrompt(recipeText, refinementRequest)
  });

  logger.info('Recipe refined');
  return result;
}

/**
 * Optimize recipe steps.
 *
 * Asks Gemini for structured JSON (`OPTIMIZED_STEPS_SCHEMA`) rather than prose,
 * so `RecipeStepOptimizer` can render the rich view without sniffing text.
 * Returns the decoded JSON as `unknown`: the caller validates it with
 * `parseOptimizedSteps` and decides what a non-conforming answer means.
 * Resolves to `null` when the model returns nothing parseable at all.
 */
export async function optimizeRecipeSteps(recipeText: string): Promise<unknown> {
  logger.debug('Optimizing recipe steps');

  const text = await generateJson({
    model: GEMINI_TEXT_MODEL,
    prompt: buildOptimizeStepsPrompt(recipeText),
    schema: OPTIMIZED_STEPS_SCHEMA
  });

  const trimmed = text.trim();
  if (!trimmed) {
    logger.warn('Step optimization returned an empty response');
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    logger.info('Recipe steps optimized');
    return parsed;
  } catch (error) {
    // Structured output makes this unlikely, but a truncated answer is still
    // possible — surface it as non-conformance rather than as a crash.
    logger.warn({ error, textLength: trimmed.length }, 'Step optimization returned non-JSON');
    return null;
  }
}
