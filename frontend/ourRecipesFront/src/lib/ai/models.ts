/**
 * Per-task LLM assignment (user decision 2026-08-25: hybrid LLM routing).
 *
 * `gemini-2.0-flash-exp` was shut down by Google on 2026-06-01, which broke
 * every AI route in production; these are the replacements decided in
 * `docs/architecture/AI_UPGRADE_TASKS.md`, since extended to a per-task
 * *provider* choice rather than just a per-task Gemini model:
 *
 *  - reformat / suggest / refine are free-text Hebrew writing tasks with no
 *    structured-output or tool-calling requirement, so they run on KIE's
 *    GPT-5.6 Luna chat endpoint for its stronger prose quality. Any KIE
 *    failure falls back to direct Gemini at the call site
 *    (`gemini/textTasks.ts`) so the feature never goes down with the newer
 *    integration.
 *  - optimize_steps needs Gemini's JSON-schema structured output, but runs it
 *    through KIE's native Gemini proxy (`kie/geminiJson.ts`): direct Google
 *    calls hit 503s and >45s hangs under load (prod 504s, 2026-08-25) while
 *    the same model answers in ~6s via KIE. Any KIE failure falls back to
 *    direct Gemini at the call site. Note KIE Gemini ids use dashes.
 *  - menu_agent needs Gemini's multi-turn function-calling chat session and
 *    stays on direct Gemini.
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

/** Direct-Gemini fallback model used whenever a KIE chat call fails. */
export const GEMINI_TEXT_FALLBACK_MODEL = 'gemini-3.7-flash';

const DEFAULT_MODELS: Record<AiTask, AiModelAssignment> = {
  reformat: { provider: 'kie', model: 'gpt-5-6-luna' },
  suggest: { provider: 'kie', model: 'gpt-5-6-luna' },
  refine: { provider: 'kie', model: 'gpt-5-6-luna' },
  optimize_steps: { provider: 'kie', model: 'gemini-3-7-flash' },
  menu_agent: { provider: 'gemini', model: 'gemini-3.1-pro-preview' }
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
