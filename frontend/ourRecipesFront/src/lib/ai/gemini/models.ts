/**
 * Per-task LLM assignment (user decision 2026-08-25: pick the right model for
 * each stage, not one model for everything).
 *
 * `gemini-2.0-flash-exp` was shut down by Google on 2026-06-01, which broke
 * every AI route in production; these are the replacements decided in
 * `docs/architecture/AI_UPGRADE_TASKS.md`.
 *
 * Tiering rationale:
 *  - reformat / suggest / refine / optimize_steps run on the Flash workhorse:
 *    they are single-shot Hebrew writing or shallow-reasoning tasks where the
 *    Pro tier adds latency and cost without visible quality gain, and the
 *    Lite tier degrades Hebrew fluency.
 *  - menu_agent runs on Pro: it is the only multi-step agentic flow (tool
 *    search -> compose -> self-review), where model depth is actually felt.
 *
 * Every assignment is overridable via `AI_MODEL_<TASK>` env vars (e.g.
 * `AI_MODEL_MENU_AGENT`) so an A/B or a model sunset never needs a deploy of
 * code changes. Read lazily so tests and runtime env changes take effect.
 */

export type AiTask = 'reformat' | 'suggest' | 'refine' | 'optimize_steps' | 'menu_agent';

const DEFAULT_MODELS: Record<AiTask, string> = {
  reformat: 'gemini-3.7-flash',
  suggest: 'gemini-3.7-flash',
  refine: 'gemini-3.7-flash',
  optimize_steps: 'gemini-3.7-flash',
  menu_agent: 'gemini-3.1-pro-preview'
};

export function getModelFor(task: AiTask): string {
  return process.env[`AI_MODEL_${task.toUpperCase()}`] || DEFAULT_MODELS[task];
}
