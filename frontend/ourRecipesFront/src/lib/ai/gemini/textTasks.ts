/**
 * Text tasks: recipe suggestion, reformat, refine, step optimization.
 *
 * Re-exported (unchanged names/signatures) from `src/lib/services/aiService.ts`
 * so routes and existing test mocks keep working.
 *
 * All four tasks are JSON-first: the model is forced onto a schema via
 * structured output, never asked for free text. A KIE assignment picks its
 * surface by model family — GPT models (default for the recipe tasks:
 * `gpt-5-6-luna`, chosen for its stronger Hebrew prose) go through KIE's
 * OpenAI Responses proxy (`kieChatText` + json_schema), Gemini models through
 * KIE's native Gemini proxy (`kieGeminiJson`) — and falls back to direct
 * Gemini on ANY failure: a KIE outage or integration bug must never take
 * these features down. The recipe tasks (suggest / reformat / refine)
 * validate the JSON against `RECIPE_JSON_SCHEMA` and return the canonical
 * channel text derived from it, so their callers keep receiving
 * `Promise<string>` and the result always round-trips through
 * `parseRecipeMessage` fully parsed.
 */
import { ThinkingLevel, type Schema } from '@google/genai';
import { logger } from '@/lib/logger';
import { OPTIMIZED_STEPS_SCHEMA } from '@/lib/recipes/optimizedSteps';
import { parseRecipeJson, recipeJsonToChannelText, RECIPE_JSON_SCHEMA } from '@/lib/recipes/recipeJson';
import { kieChatText, kieGeminiJson, toStrictJsonSchema } from '@/lib/ai/kie';
import { getModelFor, GEMINI_TEXT_FALLBACK_MODEL, type AiTask } from '@/lib/ai/models';
import { generateJson } from './generate';
import {
  buildSuggestionPrompt,
  buildReformatPrompt,
  buildRefinePrompt,
  buildOptimizeStepsPrompt,
  type RecipeSuggestionParams
} from './prompts';

/**
 * The codex surface has a baked-in "Codex coding agent" system prompt;
 * `instructions` overrides it. The schema carries the shape, so one generic
 * kitchen persona serves every task.
 */
const KIE_CHAT_INSTRUCTIONS = 'אתה עוזר מטבח מומחה. השב בעברית, על פי הסכמה הנדרשת בלבד.';

/**
 * Resolves the task's provider and generates schema-constrained JSON. Schemas
 * are authored once in Gemini form; the OpenAI surface gets them via
 * `toStrictJsonSchema`. A KIE assignment falls back to direct Gemini (fixed
 * at `GEMINI_TEXT_FALLBACK_MODEL`, not the registry's Gemini default, since
 * this is a failure path, not a routing choice) on any throw. Thinking /
 * reasoning is pinned low on every path — these are writing/extraction
 * tasks, not reasoning, and dynamic thinking alone added ~5s and ~900 tokens.
 */
async function generateTaskJson(task: AiTask, prompt: string, schema: Schema): Promise<string> {
  const assignment = getModelFor(task);

  if (assignment.provider === 'kie') {
    try {
      if (assignment.model.startsWith('gemini')) {
        return await kieGeminiJson({ model: assignment.model, prompt, schema });
      }
      return await kieChatText({
        model: assignment.model,
        instructions: KIE_CHAT_INSTRUCTIONS,
        input: prompt,
        schema: toStrictJsonSchema(schema)
      });
    } catch (error) {
      logger.warn({ task, error }, 'KIE JSON call failed, falling back to direct Gemini');
    }
  }

  const model = assignment.provider === 'gemini' ? assignment.model : GEMINI_TEXT_FALLBACK_MODEL;
  return generateJson({
    model,
    prompt,
    schema,
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
  });
}

/**
 * Runs a recipe-writing task end-to-end: schema-constrained JSON from the
 * model, validated by `parseRecipeJson`, rendered to the canonical channel
 * text. Throws when the model's answer is missing the essentials — callers
 * already surface task errors as a 500, and a recipe without ingredients is
 * a failed generation, not a result.
 */
async function generateRecipeText(task: AiTask, prompt: string): Promise<string> {
  const json = await generateTaskJson(task, prompt, RECIPE_JSON_SCHEMA);

  const recipe = parseRecipeJson(json);
  if (!recipe) {
    logger.error({ task, jsonLength: json.length }, 'Recipe task returned invalid recipe JSON');
    throw new Error(`AI returned an invalid recipe for task "${task}"`);
  }

  return recipeJsonToChannelText(recipe);
}

export async function generateRecipeSuggestion(params: RecipeSuggestionParams): Promise<string> {
  logger.debug(params, 'Generating recipe suggestion');

  const text = await generateRecipeText('suggest', buildSuggestionPrompt(params));

  logger.info('Recipe suggestion generated');
  return text;
}

export async function reformatRecipe(text: string): Promise<string> {
  logger.debug({ textLength: text.length }, 'Reformatting recipe');

  const result = await generateRecipeText('reformat', buildReformatPrompt(text));

  logger.info('Recipe reformatted');
  return result;
}

export async function refineRecipe(recipeText: string, refinementRequest: string): Promise<string> {
  logger.debug({ refinementRequest }, 'Refining recipe');

  const result = await generateRecipeText('refine', buildRefinePrompt(recipeText, refinementRequest));

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

  const text = await generateTaskJson('optimize_steps', buildOptimizeStepsPrompt(recipeText), OPTIMIZED_STEPS_SCHEMA);

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
