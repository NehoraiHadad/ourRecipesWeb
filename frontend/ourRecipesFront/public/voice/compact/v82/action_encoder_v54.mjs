// Research inference with one encoder call per Hebrew turn.
const words = text => text.match(/[א-תA-Za-z0-9]+/gu) ?? [];
const stop = new Set(['את', 'של', 'עם', 'עד', 'על', 'או', 'כל', 'כדי', 'לפי']);
const grams = word => Array.from({length: Math.max(0, word.length - 2)}, (_, i) => word.slice(i, i + 3));
const argmax = scores => scores.indexOf(Math.max(...scores));
const intents = ['report', 'next', 'missed', 'quantity', 'explain', 'clarify', 'other'];
const labels = ['none', 'done', 'pending', 'partial', 'doubt'];

function inputs(request, tokenizer, ort) {
  const sections = [[0, request.utterance]];
  for (const turn of request.history) {
    sections.push([1, (turn.role === 'assistant' ? 'שאלה ' : 'אמירה ') + turn.content]);
  }
  const actions = request.recipe.actions;
  actions.forEach((action, i) => sections.push([i + 2, action.source]));
  const tokens = [{id: tokenizer.token_to_id('[CLS]'), kind: -1}];
  for (const [kind, text] of sections) {
    for (const word of words(text)) {
      const {ids} = tokenizer.encode(word, {add_special_tokens: false});
      for (const id of ids) tokens.push({id, kind, word});
    }
    tokens.push({id: tokenizer.token_to_id('[SEP]'), kind: -1});
  }
  if (tokens.length > 512) throw new RangeError('Turn exceeds the encoder context limit');
  const pools = new Float32Array(actions.length * 3 * tokens.length);
  actions.forEach((action, i) => {
    const vocab = new Set(words(action.source).filter(w => !stop.has(w)));
    const trigrams = new Set([...vocab].flatMap(grams));
    const groups = [[], [], []];
    tokens.forEach(({kind, word}, j) => {
      if (kind === i + 2) groups[0].push(j);
      if ((kind === 0 || kind === 1) && !stop.has(word) &&
          (vocab.has(word) || grams(word).some(g => trigrams.has(g)))) groups[kind + 1].push(j);
    });
    groups.forEach((indices, k) => {
      const offset = (i * 3 + k) * tokens.length;
      for (const j of indices) pools[offset + j] = 1 / indices.length;
    });
  });
  return {
    ids: new ort.Tensor('int64', BigInt64Array.from(tokens, t => BigInt(t.id)), [1, tokens.length]),
    pools: new ort.Tensor('float32', pools, [1, actions.length, 3, tokens.length]),
  };
}

export async function classify(request, tokenizer, ort, session) {
  const scores = await session.run(inputs(request, tokenizer, ort));
  let intent = intents[argmax(scores.intent.data)];
  const facts = [];
  const clarify = argmax(scores.doubt.data) ? [null] : [];
  request.recipe.actions.forEach(({id}, i) => {
    const status = labels[argmax(scores.states.data.subarray(i * labels.length, (i + 1) * labels.length))];
    if (status === 'doubt') clarify.push(id);
    else if (status !== 'none') facts.push({action: id, status});
  });
  if (intent === 'report' && !facts.length) intent = 'clarify';
  if (intent === 'clarify' && !clarify.length) clarify.push(null);
  return {intent, facts, clarify};
}
