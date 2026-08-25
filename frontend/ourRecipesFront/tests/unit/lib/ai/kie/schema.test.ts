// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { Type } from '@google/genai';
import { toStrictJsonSchema } from '@/lib/ai/kie/schema';

describe('toStrictJsonSchema', () => {
  it('converts a nested Gemini schema into strict-mode JSON Schema', () => {
    const result = toStrictJsonSchema({
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'The name.' },
        level: { type: Type.STRING, enum: ['קל', 'בינוני'] },
        steps: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ['title']
    });

    expect(result).toEqual({
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The name.' },
        level: { type: 'string', enum: ['קל', 'בינוני'] },
        steps: { type: 'array', items: { type: 'string' } }
      },
      // strict mode: every property required, no extras — regardless of the
      // Gemini schema's own `required` list.
      required: ['title', 'level', 'steps'],
      additionalProperties: false
    });
  });
});
