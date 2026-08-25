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
import { getModelFor } from '@/lib/ai/models';
import { buildFinalizePrompt } from './prompt';
import { MENU_PLAN_SCHEMA, parseMenuPlan } from './schema';
import type { MenuPlan, MenuPreferences } from './types';

export class MenuPlanFormatError extends Error {
  constructor(message = 'התפריט שנוצר אינו בפורמט תקין') {
    super(message);
    this.name = 'MenuPlanFormatError';
  }
}

export async function finalizeMenuPlan(
  preferences: MenuPreferences,
  conclusion: string
): Promise<MenuPlan> {
  if (conclusion.trim() === '') {
    throw new MenuPlanFormatError('הסוכן לא הפיק תפריט');
  }

  const raw = await generateJson({
    model: getModelFor('menu_agent').model,
    prompt: buildFinalizePrompt(preferences, conclusion),
    schema: MENU_PLAN_SCHEMA
  });

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
