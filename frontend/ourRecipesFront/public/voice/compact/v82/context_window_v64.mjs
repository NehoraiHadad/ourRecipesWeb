// Preserve the entire request for the downstream evidence check when the encoder fills up.
import {classifyScoped} from './span_clause_v57.mjs';

export async function classifyWithinWindow(input, tokenizer, ort, session, lexicon) {
  try {
    return await classifyScoped(input, tokenizer, ort, session, lexicon);
  } catch (error) {
    if (!(error instanceof RangeError) || error.message !== 'Turn exceeds the encoder context limit') {
      throw error;
    }
    return {proposal:null, modelCalls:0};
  }
}
