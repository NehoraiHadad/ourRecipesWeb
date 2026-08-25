/**
 * The menu agent's tool-use loop.
 *
 * Two fixes over the pre-rewrite loop: every `functionCall` in a turn is
 * executed (the old code took `functionCalls[0]` and silently dropped the
 * rest, so a model that searched for three courses at once got one answer and
 * hallucinated the others), and each model turn goes through `withRetry`, so a
 * single 503 no longer kills a 60-second planning session.
 *
 * Per-request config does NOT inherit from the chat-level config in
 * `@google/genai` — the tools have to be re-sent on every turn, which is why
 * `config` is threaded through instead of being set once at `create`.
 */
import type {
  Chat,
  FunctionCall,
  GenerateContentConfig,
  GenerateContentResponse,
  Part,
  PartListUnion
} from '@google/genai';
import { logger } from '@/lib/logger';
import { getGemini } from '@/lib/ai/gemini/client';
import { getModelFor } from '@/lib/ai/models';
import { withRetry } from '@/lib/ai/gemini/retry';
import { MENU_TOOL_DECLARATIONS } from './declarations';
import { AGENT_KICKOFF, buildSystemPrompt } from './prompt';
import { executeMenuTool } from './tools';
import type { MenuPreferences } from './types';

export const MAX_AGENT_ITERATIONS = 12;

const WRAP_UP =
  'הגעת למגבלת הצעדים. סכם עכשיו בטקסט את התפריט הטוב ביותר שהרכבת עד כה, בלי לקרוא לכלים נוספים.';

export interface MenuAgentResult {
  /** The model's free-text conclusion; `finalize` turns it into a typed plan. */
  conclusion: string;
  iterations: number;
}

function buildConfig(preferences: MenuPreferences): GenerateContentConfig {
  return {
    systemInstruction: buildSystemPrompt(preferences),
    tools: [{ functionDeclarations: MENU_TOOL_DECLARATIONS }]
  };
}

function send(
  chat: Chat,
  message: PartListUnion,
  config: GenerateContentConfig
): Promise<GenerateContentResponse> {
  return withRetry((signal) => chat.sendMessage({ message, config: { ...config, abortSignal: signal } }));
}

async function runCall(call: FunctionCall): Promise<Part> {
  const name = call.name ?? '';
  try {
    const response = await executeMenuTool(name, call.args ?? {});
    return { functionResponse: { id: call.id, name, response } };
  } catch (error) {
    // Hand the failure to the model rather than aborting the session: it can
    // retry with different arguments or pick another candidate.
    logger.error({ tool: name, error }, 'Menu agent tool failed');
    return {
      functionResponse: {
        id: call.id,
        name,
        response: { error: 'הכלי נכשל. נסה שוב עם פרמטרים אחרים.' }
      }
    };
  }
}

export async function runMenuAgent(preferences: MenuPreferences): Promise<MenuAgentResult> {
  const config = buildConfig(preferences);
  const chat = getGemini().chats.create({ model: getModelFor('menu_agent').model, config });

  let response = await send(chat, AGENT_KICKOFF, config);

  for (let iteration = 1; iteration <= MAX_AGENT_ITERATIONS; iteration++) {
    const calls = response.functionCalls ?? [];
    if (calls.length === 0) {
      logger.info({ iterations: iteration - 1 }, 'Menu agent finished planning');
      return { conclusion: response.text ?? '', iterations: iteration - 1 };
    }

    logger.debug(
      { iteration, tools: calls.map((call) => call.name) },
      'Menu agent tool turn'
    );

    const parts = await Promise.all(calls.map(runCall));
    response = await send(chat, parts, config);
  }

  logger.warn({ maxIterations: MAX_AGENT_ITERATIONS }, 'Menu agent hit the iteration cap');
  // The capped turn may still be mid-tool-call, so ask for a summary with the
  // tools withheld instead of finalizing whatever half-turn we are holding.
  const wrapUp = await send(chat, WRAP_UP, { systemInstruction: config.systemInstruction });
  return { conclusion: wrapUp.text ?? response.text ?? '', iterations: MAX_AGENT_ITERATIONS };
}
