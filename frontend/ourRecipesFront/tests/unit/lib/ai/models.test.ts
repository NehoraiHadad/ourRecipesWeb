/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getModelFor } from '@/lib/ai/models';

const ENV_KEYS = ['AI_MODEL_REFORMAT', 'AI_MODEL_SUGGEST', 'AI_MODEL_REFINE', 'AI_MODEL_OPTIMIZE_STEPS', 'AI_MODEL_MENU_AGENT'];
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe('getModelFor', () => {
  it('defaults reformat / suggest / refine to KIE GPT-5.6 Luna', () => {
    expect(getModelFor('reformat')).toEqual({ provider: 'kie', model: 'gpt-5-6-luna' });
    expect(getModelFor('suggest')).toEqual({ provider: 'kie', model: 'gpt-5-6-luna' });
    expect(getModelFor('refine')).toEqual({ provider: 'kie', model: 'gpt-5-6-luna' });
  });

  it('defaults optimize_steps to KIE Gemini proxy and menu_agent to direct Gemini', () => {
    expect(getModelFor('optimize_steps')).toEqual({ provider: 'kie', model: 'gemini-3-7-flash' });
    expect(getModelFor('menu_agent')).toEqual({ provider: 'gemini', model: 'gemini-3.1-pro-preview' });
  });

  it('parses a provider:model env override', () => {
    process.env.AI_MODEL_REFORMAT = 'gemini:gemini-3.7-flash';
    expect(getModelFor('reformat')).toEqual({ provider: 'gemini', model: 'gemini-3.7-flash' });

    process.env.AI_MODEL_OPTIMIZE_STEPS = 'kie:gpt-5-6-luna';
    expect(getModelFor('optimize_steps')).toEqual({ provider: 'kie', model: 'gpt-5-6-luna' });
  });

  it('treats a bare model name override as gemini, for back-compat', () => {
    process.env.AI_MODEL_MENU_AGENT = 'gemini-3.0-pro';
    expect(getModelFor('menu_agent')).toEqual({ provider: 'gemini', model: 'gemini-3.0-pro' });
  });

  it('reads the env var lazily, per call', () => {
    expect(getModelFor('suggest')).toEqual({ provider: 'kie', model: 'gpt-5-6-luna' });
    process.env.AI_MODEL_SUGGEST = 'kie:gpt-5-6-luna-mini';
    expect(getModelFor('suggest')).toEqual({ provider: 'kie', model: 'gpt-5-6-luna-mini' });
  });
});
