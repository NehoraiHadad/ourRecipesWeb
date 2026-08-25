/**
 * Text tasks: recipe suggestion, reformat, refine, step optimization.
 *
 * Re-exported (unchanged names/signatures) from `src/lib/services/aiService.ts`
 * so routes and existing test mocks keep working.
 *
 * reformat / suggest / refine are routed per `getModelFor` (`@/lib/ai/models`):
 * by default that means KIE's GPT-5.6 Luna chat endpoint, with an automatic
 * fallback to direct Gemini on ANY failure from that call — a KIE outage or
 * integration bug must never take these features down. optimize_steps always
 * calls Gemini directly: it needs JSON-schema structured output, which KIE's
 * chat endpoint has no equivalent for.
 */
import { logger } from '@/lib/logger';
import { OPTIMIZED_STEPS_SCHEMA } from '@/lib/recipes/optimizedSteps';
import { kieChatText } from '@/lib/ai/kie';
import { getModelFor, GEMINI_TEXT_FALLBACK_MODEL, type AiTask } from '@/lib/ai/models';
import { generateText, generateJson } from './generate';
import {
  buildSuggestionPrompt,
  buildReformatPrompt,
  buildRefinePrompt,
  buildOptimizeStepsPrompt,
  type RecipeSuggestionParams
} from './prompts';
import {
  buildReformatChatPrompt,
  buildRefineChatPrompt,
  buildSuggestionChatPrompt,
  type KieChatPrompt
} from '@/lib/ai/kie/chatPrompts';

/**
 * Resolves the task's provider and generates the text accordingly. A KIE
 * assignment tries `kieChatText` first and falls back to direct Gemini
 * (fixed at `GEMINI_TEXT_FALLBACK_MODEL`, not the registry's Gemini default,
 * since this is a failure path, not a routing choice) on any error.
 */
async function generateTaskText(task: AiTask, geminiPrompt: string, kiePrompt: KieChatPrompt): Promise<string> {
  const assignment = getModelFor(task);

  if (assignment.provider === 'gemini') {
    return generateText({ model: assignment.model, prompt: geminiPrompt });
  }

  try {
    return await kieChatText({
      model: assignment.model,
      instructions: kiePrompt.instructions,
      input: kiePrompt.input
    });
  } catch (error) {
    logger.warn({ task, error }, 'KIE chat call failed, falling back to Gemini');
    return generateText({ model: GEMINI_TEXT_FALLBACK_MODEL, prompt: geminiPrompt });
  }
}

export async function generateRecipeSuggestion(params: RecipeSuggestionParams): Promise<string> {
  logger.debug(params, 'Generating recipe suggestion');

  const text = await generateTaskText('suggest', buildSuggestionPrompt(params), buildSuggestionChatPrompt(params));

  logger.info('Recipe suggestion generated');
  return text;
}

export async function reformatRecipe(text: string): Promise<string> {
  logger.debug({ textLength: text.length }, 'Reformatting recipe');

  const result = await generateTaskText('reformat', buildReformatPrompt(text), buildReformatChatPrompt(text));

  logger.info('Recipe reformatted');
  return result;
}

export async function refineRecipe(recipeText: string, refinementRequest: string): Promise<string> {
  logger.debug({ refinementRequest }, 'Refining recipe');

  const result = await generateTaskText(
    'refine',
    buildRefinePrompt(recipeText, refinementRequest),
    buildRefineChatPrompt(recipeText, refinementRequest)
  );

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
    model: getModelFor('optimize_steps').model,
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
