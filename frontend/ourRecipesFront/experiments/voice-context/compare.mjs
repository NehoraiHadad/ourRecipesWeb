// Bundled only for the experiment. The browser worker and app router come from the release.
import { activeRecipe } from '../../src/lib/voice/compactEngine';
import { parseIngredientLine } from '../../src/lib/recipes/ingredientParser';
import { questionOnly, recipeTurn } from '../../src/lib/voice/recipeConversation';

const clean = text => text.replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
const states = { done: 'סומן במלואו', partial: 'סומן חלקית', pending: 'עדיין לא סומן' };
function ingredientNames(text, items) {
  const words = ' ' + clean(text) + ' ';
  return items.filter(i => ['', 'ה', 'מ', 'מה', 'ו', 'וה', 'ב'].some(prefix => words.includes(' ' + prefix + i.name + ' ')));
}
function focused(recipe, state, step, utterance, history) {
  const text = clean(utterance);
  const report = utterance.match(/^([^?!.,]+)[,]\s*(מה עוד נשאר להוסיף|מה נשאר לשים|מה עוד חסר)\??$/);
  if (report) {
    const update = recipeTurn(recipe, state, step, report[1]);
    if (update?.writes.length) {
      const next = {...state, ...Object.fromEntries(update.writes.map(w => [w.action, w.status]))};
      const remaining = recipeTurn(recipe, next, step, 'מה נשאר להוסיף');
      return {...update, reply: update.reply + ' ' + remaining.reply};
    }
  }
  if (/^(?:רגע )?בעצם (?:שמתי|הוספתי) /.test(text) && !utterance.includes('?') && !/[.!,]/.test(utterance.replace(/^רגע,/, ''))) {
    const clause = text.replace(/^(?:רגע )?בעצם /, '');
    if (/ממנו|ממנה|מהם|מהן/.test(clause)) return {reply:'לאיזה מצרך התכוונת?',writes:[]};
    const correction = recipeTurn(recipe,state,step,clause);
    if (correction?.writes.length) return correction;
  }
  const pronoun = /^(?:ו?כמה (?:ממנו|ממנה|מהן|מהם)(?: צריך)?|ו?מה הכמות (?:שלו|שלה|שלהן|שלהם))$/.test(text);
  const remainder = /^כמה .+ נשאר להוסיף$/.test(text);
  const status = /^(?:האם )?.+ כבר בפנים$/.test(text);
  if (!pronoun && !remainder && !status) return;
  // The last answer provides a referent. A newer unrelated exchange supersedes an old topic.
  const source = pronoun ? history.at(-1)?.content || '' : text;
  const found = ingredientNames(source,recipe.ingredients);
  if (found.length !== 1) return {reply:'לאיזה מצרך התכוונת?',writes:[]};
  const item = found[0], value = state[item.id] || 'pending';
  let reply = item.label + '.';
  if (status) reply = item.name + ' ' + states[value] + '.';
  if (remainder && value === 'partial') reply = item.name + ' סומן חלקית. לא תועד כמה הוספת.';
  if (remainder && value === 'done') reply = 'כבר הוספת את כל הכמות של ' + item.name + '.';
  return {reply,writes:[]};
}

const worker = new Worker('/voice/compact/v82/worker.mjs', {type:'module'});
let seq = 0;
function request(message) {
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(Error('worker timeout')), 90000);
    worker.onerror = err => { clearTimeout(timer); reject(Error(err.message)); };
    worker.onmessage = ({data}) => {
      clearTimeout(timer);
      if (data.error) reject(Error(data.error)); else resolve(data.result);
    };
    worker.postMessage(message);
  });
}
window.boot = () => request({});
window.setupRecipes = (definitions) => Object.fromEntries(Object.entries(definitions).map(([id,[name,steps,labels]],i) =>
  [id,activeRecipe(i+1,name,steps,labels.map(parseIngredientLine))]));
window.trial = async (mode, item, recipe) => {
  const start = performance.now();
  const state = Object.fromEntries([...recipe.actions,...recipe.ingredients].map(i=>[i.id,item.state[i.id] || 'pending']));
  const history = mode.startsWith('full') ? item.history : item.history.slice(-4);
  let result = mode === 'focused' ? focused(recipe,state,item.step,item.text,history) : undefined;
  let route = 'focused';
  if (!result) { result = recipeTurn(recipe,state,item.step,item.text); route = 'app'; }
  let calls = 0, bytes = 0;
  if (!result) {
    route = 'worker';
    const progress = Object.fromEntries(recipe.actions.map(a=>[a.id,state[a.id]]));
    const input = {recipe,progress,currentStep:item.step,utterance:item.text,history};
    if (mode.endsWith('State')) {
      // The encoder reads only utterance/history/action source. This makes state visible to it.
      const summary = recipe.ingredients.map(i=>i.name + ' ' + states[state[i.id]]).join(', ');
      input.history = [{role:'assistant',content:'מצב המצרכים המעודכן: ' + summary}, ...history];
    }
    if (mode === 'focused' || mode === 'structured') input.ingredientProgress = Object.fromEntries(recipe.ingredients.map(i=>[i.id,state[i.id]]));
    bytes = new TextEncoder().encode(JSON.stringify(input)).byteLength;
    result = await request({id:String(++seq),input});
    calls = result.modelCalls;
    if (!Array.isArray(result.writes) || result.writes.some(w => w.recipe_id !== recipe.id || w.recipe_version !== recipe.version ||
        !(w.action in progress) || !(w.status in states))) throw Error('Invalid worker write');
    if (result.writes.length && questionOnly(item.text)) result = {writes:[], reply:'לא ברור לי מה רצית לדעת. אפשר לשאול מה השלב הבא או כמה צריך ממצרך מסוים.'};
  }
  const ms = performance.now()-start;
  return {ms, route, calls, bytes, reply:result.reply, writes:result.writes.map(w=>[w.action,w.status]),
    proposal:route==='worker' && result.writes.length>0};
};
