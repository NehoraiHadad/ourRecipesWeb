// Research reader. Portions are shares of the quantity in the active recipe.
import { parseIngredientLine, quantityAsNumber } from '../../src/lib/recipes/ingredientParser';
import { recipeTurn } from '../../src/lib/voice/recipeConversation';

const fractions = new Map([['חצי', 0.5], ['רבע', 0.25], ['שלושה רבעים', 0.75]]);
const units = new Map([['כוסות','כוס'], ['כפות','כף'], ['כפיות','כפית']]);
const tidy = text => text.replace(/[?!.,]+$/g,'').trim().replace(/\s+/g,' ');
const bare = text => text.split(' ').map(word => word.replace(/^ה(?=..)/,'')).join(' ');
const unit = name => units.get(name) || name;
const clarify = () => ({reply:'לאיזה מצרך או לכמות של איזה מצרך התכוונת?',writes:[]});
const read = reply => ({reply,writes:[]});
function resolve(recipe, phrase) {
  const normalized = bare(phrase.replace(/^את /,''));
  const matches = recipe.ingredients.filter(i => bare(i.name) === normalized);
  return matches.length === 1 ? matches[0] : undefined;
}
function lastMention(recipe, history) {
  const answer = ' ' + bare((history.at(-1)?.content || '').replace(/[.,:()?!]/g,' ')).replace(/\s+/g,' ') + ' ';
  const hits = recipe.ingredients.filter(i => answer.includes(' '+bare(i.name)+' '));
  return hits.length === 1 ? hits[0] : undefined;
}
function amountLeft(item, share) {
  const part = new Map([[0.25,'רבע'],[0.5,'חצי'],[0.75,'שלושה רבעים']]).get(1-share);
  const description = part ? part + ' מהכמות של ' + item.name : 'מהכמות של ' + item.name;
  const original = parseIngredientLine(item.label);
  const total = quantityAsNumber(original);
  if (!(total > 0)) return part ? 'נשאר להוסיף ' + description + '.' : 'אין במתכון כמות מדויקת לחישוב.';
  const left = total*(1-share);
  const measurement = original.unit ? (left <= 1 ? unit(original.unit) : original.unit) : '';
  const amount = [Number(left.toFixed(4)), measurement, item.name].filter(v => v !== '').join(' ');
  return 'נשאר להוסיף ' + amount + (part ? ' (' + description + ')' : '') + '.';
}
function record(recipe, state, step, item, share) {
  // Reuse the app's matching and coupling to an explicit "add <ingredient>" action.
  // A broad mixing step cannot be completed by this ingredient report.
  const status = share === 1 ? 'done' : 'partial';
  const result = recipeTurn(recipe,state,step,'שמתי ' + item.name);
  if (!result?.writes.some(w => w.action === item.id)) return clarify();
  const writes = result.writes.map(w=>({...w,status}));
  const part = [...fractions].find(([,value]) => value === share)?.[0];
  const amount = share === 1 ? 'כל הכמות' : (part || (share*100).toFixed(1)+'%') + ' מהכמות';
  return {reply:'רשמתי שהוספת ' + amount + ' של ' + item.name + '.',writes, portions:{[item.id]:share}};
}
export function ingredientTurn(recipe,state,step,utterance,history,portions) {
  const text = tidy(utterance);
  const question = /\?\s*$/.test(utterance);
  const known = name => resolve(recipe,name);
  const status = item => {
    if (!item) return clarify();
    const wording = {done:'כבר סומן במלואו',partial:'סומן חלקית',pending:'עדיין לא סומן'};
    return read(item.name + ' ' + wording[state[item.id] || 'pending'] + '.');
  };
  // These questions ask for recorded status even when the transcript omits punctuation.
  const inquiry = /^(?:(?:רגע|תזכיר[י]? לי)[, ]+)?(?:האם )?(?:את )?([^,?]+?) (?:כבר (?:בפנים|הוספתי|הכנסתי|שמתי))(?: (?:לסיר|לקערה))?$/.exec(text);
  if (inquiry && (question || /בפנים$|^תזכיר|^האם/.test(text))) return status(known(inquiry[1]));
  if (/^(?:רגע[, ]+)?(?:נראה לי ש)?כבר המלחנו[, ]+נכון$/.test(text)) return status(known('מלח'));
  const hypothetic = /^אם (?:אשים|נוסיף|אוסיף) (?:רק )?(?:חצי|רבע) מ(.+?)[, ]+(?:זה|האם זה) יספיק$/.exec(text);
  if (hypothetic) {
    const item = known(hypothetic[1]);
    return item ? read('המתכון מציין ' + item.label + '. לא כתוב אם כמות קטנה יותר תספיק.') : clarify();
  }
  const left = /^(?:אז )?(?:ו?כמה (.+?) (?:עוד )?נשאר (?:לי )?(?:לשים|להוסיף)|ו?כמה (?:עוד )?נשאר(?: לי)?(?: (?:להוסיף|לשים))?(?: מ(.+))?)$/.exec(text);
  if (left) {
    const phrase = left[1] || left[2];
    const item = !phrase || ['ממנו','ממנה','מזה','מנו','מנה','זה'].includes(phrase) ?
      lastMention(recipe,history) : known(phrase);
    if (!item) return clarify();
    if (state[item.id] === 'done') return read('כבר הוספת את כל הכמות של ' + item.name + '.');
    if (state[item.id] !== 'partial') return read('לפי הסימון נשאר להוסיף ' + item.label + '.');
    const share = portions[item.id];
    return read(share > 0 && share < 1 ? amountLeft(item,share) : item.name + ' סומן חלקית. לא תועד כמה הוספת.');
  }

  const fronted = /^(?:את )?([^,?!]+?) (?:כבר )?(?:הכנסתי|שמתי|הוספתי|הכנסנו|הוספנו) (?:ל(?:תוך ה)?קערה|בקערה|לסיר)(?:[, ]+(?:עוד )?נשאר (?:לי |לנו )?להוסיף (.+))?$/.exec(text);
  if (fronted) {
    const item = known(fronted[1]);
    if (!item) return clarify();
    if (question) return status(item);
    if (fronted[2] && /[,;.!?]|(?:^| )(?:אבל|ואז|שמתי|הוספתי|ערבבתי)(?: |$)/.test(fronted[2])) return clarify();
    const update = recipeTurn(recipe,state,step,'שמתי ' + item.name);
    if (!update?.writes.length) return clarify();
    const next = {...state,...Object.fromEntries(update.writes.map(w=>[w.action,w.status]))};
    return {...update,reply:update.reply+(fronted[2] ? ' '+recipeTurn(recipe,next,step,'מה נשאר להוסיף').reply : '')};
  }
  const report = /^(?:(?:רגע[, ]+)?(?:בעצם|תיקון)[, ]+)?(?:אני )?(?:שמתי|הוספתי|מזגתי|שמנו|הוספנו) (.+)$/.exec(text);
  if (!report) return;
  let object = report[1].replace(/^רק /,'');
  const more = object.startsWith('עוד ');
  if (more) object = object.slice(4);
  const fraction = /^(חצי|רבע|שלושה רבעים) מ(?:הכמות של )?(.+)$/.exec(object);
  const measured = parseIngredientLine(object);
  if (measured.quantity == null && /^(?:כוס|כף|כפית) /.test(object)) {
    Object.assign(measured, parseIngredientLine('1 ' + object));
  }
  const measuredQty = quantityAsNumber(measured);
  if (!fraction && !(measured.unit && measuredQty !== null)) return;
  if (question || /[?!;,]/.test(object)) return read('האם זו הכמות שכבר הוספת?');
  const item = fraction && ['מנו','מנה','הם','הן'].includes(fraction[2]) ?
    lastMention(recipe,history) : known(fraction ? fraction[2] : measured.name);
  if (!item) return clarify();
  const original = parseIngredientLine(item.label);
  const total = quantityAsNumber(original);
  if (!fraction && (unit(original.unit) !== unit(measured.unit) || !(total > 0))) {
    return read('הכמות במתכון היא ' + item.label + '. כמה מהכמות הזאת כבר הוספת?');
  }
  let share = fraction ? fractions.get(fraction[1]) : measuredQty/total;
  if (more) {
    const before = state[item.id] === 'partial' ? portions[item.id] : state[item.id] === 'done' ? 1 : 0;
    if (!Number.isFinite(before)) return read('לא תועד כמה הוספת קודם. מה הכמות הכוללת שהוספת עד עכשיו?');
    share += before;
  }
  if (!(share > 0 && share <= 1)) return read('הכמות המדווחת חורגת מהכמות שבמתכון. כמה הוספת בסך הכול?');
  return record(recipe,state,step,item,share);
}

export function nextPortions(before,result) {
  const next = {...before};
  for (const [id,status] of result.writes) {
    delete next[id];
    if (status === 'partial' && result.portions?.[id] > 0 && result.portions[id] < 1) next[id] = result.portions[id];
  }
  return next;
}
