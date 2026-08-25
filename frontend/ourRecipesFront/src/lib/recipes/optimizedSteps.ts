/**
 * The contract for `POST /api/recipes/optimize-steps`.
 *
 * The shape is dictated by `RecipeStepOptimizer` (src/components/recipe):
 * it renders a headline of three totals, an optional "prepare ahead" block,
 * and one card per step group listing the steps that can run in parallel.
 * Both the Gemini `responseSchema` and the server-side validator live here so
 * the model contract and the runtime check can never drift apart.
 *
 * Every time value is a **string of minutes** (`"25"`), except
 * `prep_ahead_steps[].max_prep_time`, which the UI renders as hours.
 */
import { Type, type Schema } from '@google/genai';

export interface OptimizedStep {
  description: string;
  estimated_time: string;
  dependencies: string[];
}

export interface OptimizedStepGroup {
  step_group: string;
  parallel_steps: OptimizedStep[];
}

export interface PrepAheadStep {
  description: string;
  max_prep_time: string;
}

export interface OptimizedSteps {
  optimized_steps: OptimizedStepGroup[];
  prep_ahead_steps: PrepAheadStep[];
  total_optimized_time: string;
  total_sequential_time: string;
  time_saved: string;
}

/**
 * Gemini structured-output schema. `propertyOrdering` keeps the model's JSON
 * deterministic; every field is required so a partial answer is rejected by
 * the API rather than by us.
 */
export const OPTIMIZED_STEPS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    optimized_steps: {
      type: Type.ARRAY,
      description: 'Groups of steps, in execution order.',
      items: {
        type: Type.OBJECT,
        properties: {
          step_group: {
            type: Type.STRING,
            description: 'Short Hebrew name of the phase, e.g. "הכנת הבצק".'
          },
          parallel_steps: {
            type: Type.ARRAY,
            description: 'Steps inside this group that can run at the same time.',
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING, description: 'What to do, in Hebrew.' },
                estimated_time: {
                  type: Type.STRING,
                  description: 'Estimated minutes as a number string, e.g. "10".'
                },
                dependencies: {
                  type: Type.ARRAY,
                  description: 'Names of steps that must finish first (may be empty).',
                  items: { type: Type.STRING }
                }
              },
              required: ['description', 'estimated_time', 'dependencies'],
              propertyOrdering: ['description', 'estimated_time', 'dependencies']
            }
          }
        },
        required: ['step_group', 'parallel_steps'],
        propertyOrdering: ['step_group', 'parallel_steps']
      }
    },
    prep_ahead_steps: {
      type: Type.ARRAY,
      description: 'Steps that can be done in advance (may be empty).',
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING, description: 'What to prepare ahead, in Hebrew.' },
          max_prep_time: {
            type: Type.STRING,
            description: 'How many hours ahead it may be prepared, as a number string.'
          }
        },
        required: ['description', 'max_prep_time'],
        propertyOrdering: ['description', 'max_prep_time']
      }
    },
    total_sequential_time: {
      type: Type.STRING,
      description: 'Total minutes when following the original recipe, as a number string.'
    },
    total_optimized_time: {
      type: Type.STRING,
      description: 'Total minutes with the optimized plan, as a number string.'
    },
    time_saved: {
      type: Type.STRING,
      description: 'Minutes saved (sequential minus optimized), as a number string.'
    }
  },
  required: [
    'optimized_steps',
    'prep_ahead_steps',
    'total_sequential_time',
    'total_optimized_time',
    'time_saved'
  ],
  propertyOrdering: [
    'optimized_steps',
    'prep_ahead_steps',
    'total_sequential_time',
    'total_optimized_time',
    'time_saved'
  ]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Coerce a time field. Models routinely answer `25` instead of `"25"` even
 * with a STRING schema, so accept finite numbers and normalise them; anything
 * else (null, object, empty string) fails the shape.
 */
function asTimeString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function parseStep(value: unknown): OptimizedStep | null {
  if (!isRecord(value)) return null;

  const description = asNonEmptyString(value.description);
  const estimatedTime = asTimeString(value.estimated_time);
  if (description === null || estimatedTime === null) return null;

  const rawDependencies = value.dependencies;
  if (rawDependencies !== undefined && !Array.isArray(rawDependencies)) return null;
  const dependencies = (rawDependencies ?? []).filter(
    (dependency): dependency is string => typeof dependency === 'string'
  );

  return { description, estimated_time: estimatedTime, dependencies };
}

function parseGroup(value: unknown): OptimizedStepGroup | null {
  if (!isRecord(value)) return null;

  const stepGroup = asNonEmptyString(value.step_group);
  if (stepGroup === null || !Array.isArray(value.parallel_steps)) return null;

  const parallelSteps: OptimizedStep[] = [];
  for (const rawStep of value.parallel_steps) {
    const step = parseStep(rawStep);
    if (step === null) return null;
    parallelSteps.push(step);
  }

  return { step_group: stepGroup, parallel_steps: parallelSteps };
}

function parsePrepAheadStep(value: unknown): PrepAheadStep | null {
  if (!isRecord(value)) return null;

  const description = asNonEmptyString(value.description);
  const maxPrepTime = asTimeString(value.max_prep_time);
  if (description === null || maxPrepTime === null) return null;

  return { description, max_prep_time: maxPrepTime };
}

/**
 * Validate a model answer against the contract above.
 *
 * Returns `null` — never a partially-filled object — when the answer does not
 * conform, so callers can turn non-conformance into a clean upstream error
 * instead of rendering garbage.
 */
export function parseOptimizedSteps(value: unknown): OptimizedSteps | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.optimized_steps)) return null;

  const optimizedSteps: OptimizedStepGroup[] = [];
  for (const rawGroup of value.optimized_steps) {
    const group = parseGroup(rawGroup);
    if (group === null) return null;
    optimizedSteps.push(group);
  }
  // An "optimization" with no steps at all is a non-answer.
  if (optimizedSteps.length === 0) return null;

  // `prep_ahead_steps` is legitimately empty for simple recipes; a missing
  // key is tolerated, a malformed entry is not.
  const rawPrepAhead = value.prep_ahead_steps;
  if (rawPrepAhead !== undefined && !Array.isArray(rawPrepAhead)) return null;

  const prepAheadSteps: PrepAheadStep[] = [];
  for (const rawStep of rawPrepAhead ?? []) {
    const step = parsePrepAheadStep(rawStep);
    if (step === null) return null;
    prepAheadSteps.push(step);
  }

  const totalSequential = asTimeString(value.total_sequential_time);
  const totalOptimized = asTimeString(value.total_optimized_time);
  const timeSaved = asTimeString(value.time_saved);
  if (totalSequential === null || totalOptimized === null || timeSaved === null) {
    return null;
  }

  return {
    optimized_steps: optimizedSteps,
    prep_ahead_steps: prepAheadSteps,
    total_sequential_time: totalSequential,
    total_optimized_time: totalOptimized,
    time_saved: timeSaved
  };
}
