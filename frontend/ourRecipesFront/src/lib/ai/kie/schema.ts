/**
 * Converts a Gemini `Schema` (the format `generateJson` / `kieGeminiJson`
 * consume natively) into a standard JSON Schema for the OpenAI Responses
 * surface (`kieChatText`'s `text.format`), so every schema in the codebase is
 * authored exactly once, in Gemini form.
 *
 * The output is shaped for `strict: true` mode, which demands that every
 * object lists ALL its properties as required and forbids extras. Optional
 * fields therefore become required here — models return an empty array /
 * best-guess value instead of omitting the key, and the caller's validator
 * (e.g. `parseRecipeJson`) stays the arbiter of what is actually mandatory.
 */
import type { Schema } from '@google/genai';

export function toStrictJsonSchema(schema: Schema): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (schema.type) result.type = String(schema.type).toLowerCase();
  if (schema.description) result.description = schema.description;
  if (schema.enum) result.enum = schema.enum;
  if (schema.items) result.items = toStrictJsonSchema(schema.items);

  if (schema.properties) {
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      properties[key] = toStrictJsonSchema(value);
    }
    result.properties = properties;
    result.required = Object.keys(schema.properties);
    result.additionalProperties = false;
  }

  return result;
}
