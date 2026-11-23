// Route unambiguous action mentions to the same trained local ONNX classifier.
import {classify as predict} from './action_encoder_v54.mjs';

const words = text => text.match(/[א-ת]+/gu) ?? [];
const stop = new Set(['את','עם','עד','על','של','או','לתוך','כדי','לפי','כף','כוס','דקות']);
const unprefix = word => word.replace(/^[וה]/u, '');
const normalize = word => word.replace(/[ךםןףץ]/gu, c => ({ך:'כ',ם:'מ',ן:'נ',ף:'פ',ץ:'צ'})[c]);
const skeleton = word => normalize(word).replace(/[יו]/gu, '');
const pronoun = /(?:^|\s)(?:אותו|אותה|אותן|אותם|מהם|מהן)(?:\s|$)/u;
const skip = /[?״"“”]|(?:^|\s)(?:טעיתי|התבלבלתי|תיקון|אמרתי|במתכון הקודם|כשאסיים|אילו)(?:\s|$)/u;
const segments = /\s*[.;!?]+\s*|\s*,?\s+(?:אבל|ובנוסף|וגם|ואילו|ומצד שני)\s+/u;

function descriptor(action, lexicon) {
  const [verb, ...object] = words(action.source);
  const names = new Set([verb, ...(lexicon[verb] ?? [])]);
  return {id:action.id, names, root:skeleton((verb ?? '').replace(/^ל/u, '')),
          object:new Set(object.filter(w => !stop.has(w)).map(unprefix))};
}

function mentions(word, action) {
  for (const w of [word, word.replace(/^[וש]/u,'')]) {
    if (action.names.has(w)) return true;
    if (w.endsWith('תי') && action.root.length >= 3 && skeleton(w.slice(0,-2)) === action.root) return true;
  }
  return false;
}

function intersection(a,b) {
  return [...a].filter(w => b.has(w)).length;
}

function bind(text, actions, previous) {
  const tokens = words(text);
  const matched = actions.filter(a => tokens.some(w => mentions(w,a)));
  if (!matched.length || new Set(matched.map(a => [...a.names][0])).size !== 1) return null;
  const nouns = new Set(tokens.filter(w => !stop.has(w)).map(unprefix));
  const scores = matched.map(action => intersection(action.object,nouns));
  if (Math.max(...scores) === 0 && previous && pronoun.test(text)) {
    matched.forEach((a,i) => {scores[i] = intersection(a.object,previous.object);});
  }
  const best = Math.max(...scores);
  const winners = matched.filter((_,i) => scores[i]===best);
  return best>0 && winners.length===1 ? winners[0] : null;
}

export function bindTurn(request, lexicon) {
  if (skip.test(request.utterance) || request.history.length) return null;
  const actions = request.recipe.actions.map(a => descriptor(a,lexicon));
  const clauses = request.utterance.split(segments).map(s => s.trim()).filter(Boolean);
  if (!clauses.length || clauses.length>3) return null;
  const bound = [];
  for (const text of clauses) {
    const action = bind(text,actions,bound.at(-1)?.action);
    if (!action || bound.some(item => item.action.id===action.id)) return null;
    bound.push({action,text});
  }
  return bound;
}

export async function classifyScoped(request, tokenizer, ort, session, lexicon) {
  const initial = await predict(request,tokenizer,ort,session);
  const bound = bindTurn(request,lexicon);
  if (!bound) return {proposal:initial, modelCalls:1, scoped:false};
  const facts = [], clarify = [];
  let calls = 1;
  for (const {action,text} of bound) {
    let response = initial;
    if (bound.length>1) {
      response = await predict({...request,utterance:text},tokenizer,ort,session);
      calls++;
    }
    facts.push(...response.facts.filter(f => f.action===action.id));
    if (response.clarify.includes(action.id)) clarify.push(action.id);
  }
  let intent = initial.intent;
  if (['report','clarify'].includes(intent)) intent = facts.length ? 'report' : 'clarify';
  if (intent==='clarify' && !clarify.length) clarify.push(null);
  return {proposal:{intent,facts,clarify}, modelCalls:calls, scoped:true};
}
