/**
 * Gemini model ids.
 *
 * `gemini-2.0-flash-exp` was shut down by Google on 2026-06-01, which broke
 * every AI route in production. These are the replacements decided in
 * `docs/architecture/AI_UPGRADE_TASKS.md`.
 */

/** Text tasks: reformat / suggest / refine / optimize-steps. */
export const GEMINI_TEXT_MODEL = 'gemini-3.7-flash';

/** Menu-planning agent loop (Wave 2) — exported now so that wave can import it. */
export const GEMINI_AGENT_MODEL = 'gemini-3.1-pro-preview';
