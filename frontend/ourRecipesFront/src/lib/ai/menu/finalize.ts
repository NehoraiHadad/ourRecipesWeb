/**
 * Turn the agent's free-text conclusion into a typed `MenuPlan`.
 *
 * Done as a separate `generateContent` call with `responseMimeType:
 * 'application/json'` + `responseSchema`, because the Gemini API rejects a
 * response schema on a request that also declares function-calling tools —
 * the chat session keeps its tools, this call keeps the schema. No JSON is
 * ever fished out of prose with a regex (the old failure mode: a model that
 * wrapped its answer in commentary produced `Failed to generate valid menu
 * plan` for the user).
 */
import { logger } from '@/lib/logger';
import { generateJson } from '@/lib/ai/gemini/generate';
import { kieGeminiJson } from '@/lib/ai/kie';
import { getModelFor, GEMINI_TEXT_FALLBACK_MODEL } from '@/lib/ai/models';
import { buildFinalizePrompt } from './prompt';
import { MENU_PLAN_SCHEMA, parseMenuPlan } from './schema';
import type { MenuPlan, MenuPreferences } from './types';

export class MenuPlanFormatError extends Error {
  constructor(message = 'התפריט שנוצר אינו בפורמט תקין') {
    super(message);
    this.name = 'MenuPlanFormatError';
  }
}

/**
 * Same KIE-first / direct-Gemini-fallback routing as the other text tasks
 * (`gemini/textTasks.ts#generateStepsJson`), keyed off the menu agent's
 * assignment so the finalize call rides the same provider as the session.
 */
async function generatePlanJson(prompt: string): Promise<string> {
  const assignment = getModelFor('menu_agent');

  if (assignment.provider === 'kie') {
    try {
      return await kieGeminiJson({ model: assignment.model, prompt, schema: MENU_PLAN_SCHEMA });
    } catch (error) {
      logger.warn({ error }, 'KIE finalize call failed, falling back to direct Gemini');
      return generateJson({ model: GEMINI_TEXT_FALLBACK_MODEL, prompt, schema: MENU_PLAN_SCHEMA });
    }
  }

  return generateJson({ model: assignment.model, prompt, schema: MENU_PLAN_SCHEMA });
}

export async function finalizeMenuPlan(
  preferences: MenuPreferences,
  conclusion: string
): Promise<MenuPlan> {
  if (conclusion.trim() === '') {
    throw new MenuPlanFormatError('הסוכן לא הפיק תפריט');
  }

  const raw = await generatePlanJson(buildFinalizePrompt(preferences, conclusion));

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    // Length, not content: the model's answer has no place in the logs.
    logger.error({ length: raw.length }, 'Menu plan JSON did not parse');
    throw new MenuPlanFormatError();
  }

  const plan = parseMenuPlan(decoded);
  if (plan === null) {
    logger.error({ length: raw.length }, 'Menu plan failed validation');
    throw new MenuPlanFormatError();
  }

  return plan;
}
