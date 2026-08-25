/**
 * Per-task LLM assignment (user decision 2026-08-25: hybrid LLM routing).
 *
 * `gemini-2.0-flash-exp` was shut down by Google on 2026-06-01, which broke
 * every AI route in production; these are the replacements decided in
 * `docs/architecture/AI_UPGRADE_TASKS.md`, since extended to a per-task
 * *provider* choice rather than just a per-task Gemini model:
 *
 *  - reformat / suggest / refine / optimize_steps are all JSON-first
 *    (2026-08-26): every task uses JSON-schema structured output. A KIE
 *    assignment picks its surface by model family — GPT ids go through KIE's
 *    OpenAI Responses proxy (`kie/chat.ts`, which passes `text.format`
 *    json_schema through even though KIE's docs omit it; verified
 *    empirically), Gemini ids through KIE's native Gemini proxy
 *    (`kie/geminiJson.ts`). The recipe-writing tasks stay on GPT-5.6 Luna
 *    for its stronger Hebrew prose; optimize_steps is extraction, so it runs
 *    the cheaper/faster Gemini flash. KIE is preferred over direct Google
 *    because direct calls hit 503s and >45s hangs under load (prod 504s,
 *    2026-08-25) while the same model answers in ~6s via KIE. Any KIE
 *    failure falls back to direct Gemini at the call site
 *    (`gemini/textTasks.ts`) so the feature never goes down with the newer
 *    integration. Note KIE Gemini ids use dashes.
 *  - menu_agent needs Gemini's multi-turn function-calling chat session; the
 *    SDK is pointed at KIE's proxy (`gemini/client.ts#getGeminiVia`) since the
 *    production Google key is free-tier, where `gemini-3.1-pro` has quota 0
 *    (hard 429, verified 2026-08-25) — KIE's native surface only carries the
 *    flash family, so the agent runs `gemini-3-7-flash` there.
 *
 * Moved out of `gemini/models.ts`: this file now resolves a provider, not
 * just a Gemini model id, so it no longer belongs under `gemini/`.
 *
 * Every assignment is overridable via `AI_MODEL_<TASK>` env vars as
 * `provider:model` (e.g. `AI_MODEL_REFORMAT=gemini:gemini-3.7-flash`) so an
 * A/B test or a model sunset never needs a code deploy. A bare model name
 * with no `provider:` prefix is back-compat for the pre-hybrid config and is
 * treated as `gemini:<model>`. Read lazily so tests and runtime env changes
 * take effect.
 */

export type AiTask = 'reformat' | 'suggest' | 'refine' | 'optimize_steps' | 'menu_agent';
export type AiProvider = 'gemini' | 'kie';

export interface AiModelAssignment {
  provider: AiProvider;
  model: string;
}

/** Direct-Gemini fallback model used whenever a KIE call fails. */
export const GEMINI_TEXT_FALLBACK_MODEL = 'gemini-3.7-flash';

const DEFAULT_MODELS: Record<AiTask, AiModelAssignment> = {
  reformat: { provider: 'kie', model: 'gpt-5-6-luna' },
  suggest: { provider: 'kie', model: 'gpt-5-6-luna' },
  refine: { provider: 'kie', model: 'gpt-5-6-luna' },
  optimize_steps: { provider: 'kie', model: 'gemini-3-7-flash' },
  menu_agent: { provider: 'kie', model: 'gemini-3-7-flash' }
};

/** `provider:model` (hybrid config) or a bare model id (pre-hybrid back-compat, implies Gemini). */
function parseOverride(raw: string): AiModelAssignment {
  const separator = raw.indexOf(':');
  if (separator === -1) {
    return { provider: 'gemini', model: raw };
  }

  const provider = raw.slice(0, separator);
  const model = raw.slice(separator + 1);
  if (provider === 'gemini' || provider === 'kie') {
    return { provider, model };
  }

  // Unrecognized prefix: treat the whole value as a literal Gemini model id
  // rather than silently dropping part of it.
  return { provider: 'gemini', model: raw };
}

export function getModelFor(task: AiTask): AiModelAssignment {
  const override = process.env[`AI_MODEL_${task.toUpperCase()}`];
  return override ? parseOverride(override) : DEFAULT_MODELS[task];
}
