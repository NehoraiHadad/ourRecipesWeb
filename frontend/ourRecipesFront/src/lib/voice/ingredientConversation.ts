// Portions are shares of the quantity in the active recipe.
import { parseIngredientLine, quantityAsNumber } from '../recipes/ingredientParser';
import { recipeTurn, type RecipeTurn } from './recipeConversation';
import type { ActiveRecipe, RecipeIngredient, Turn, Progress } from './compactEngine';

type States = Record<string, Progress>;
export type Portions = Record<string, number>;
export type IngredientReply = RecipeTurn & { portions?: Portions };

const fractions = new Map([['חצי', 0.5], ['רבע', 0.25], ['שלושה רבעים', 0.75]]);
const units = new Map([['כוסות', 'כוס'], ['כפות', 'כף'], ['כפיות', 'כפית']]);
const tidy = (text: string) => text.replace(/[?!.,]+$/g, '').trim().replace(/\s+/g, ' ');
const bare = (text: string) => text.split(' ').map(word => word.replace(/^ה(?=..)/, '')).join(' ');
const unit = (name?: string) => name && (units.get(name) || name);
const clarify = () => read('לאיזה מצרך התכוונת?');
const read = (reply: string): IngredientReply => ({ reply, writes: [] });
function resolve(recipe: ActiveRecipe, phrase: string) {
  const normalized = bare(phrase.replace(/^את /, ''));
  const matches = recipe.ingredients.filter(i => bare(i.name) === normalized);
  return matches.length === 1 ? matches[0] : undefined;
}
function lastMention(recipe: ActiveRecipe, history: Turn[]) {
  const tokens = (history.at(-1)?.content || '').match(/[א-ת]+/g) || [];
  const hits = recipe.ingredients.filter(item => {
    const name = bare(item.name).split(' ');
    return tokens.some((word, start) => {
      const first = ['', 'ו', 'ב', 'ל', 'מ', 'וב', 'ול', 'ומ'].some(prefix =>
        word.startsWith(prefix) && bare(word.slice(prefix.length)) === name[0]);
      return first && name.slice(1).every((part, i) => bare(tokens[start + i + 1] || '') === part);
    });
  });
  return hits.length === 1 ? hits[0] : undefined;
}
function amountLeft(item: RecipeIngredient, share: number) {
  const part = new Map([[0.25, 'רבע'], [0.5, 'חצי'], [0.75, 'שלושה רבעים']]).get(1 - share);
  const description = part ? part + ' מהכמות של ' + item.name : 'מהכמות של ' + item.name;
  const original = parseIngredientLine(item.label);
  const total = quantityAsNumber(original);
  if (total === null || total <= 0) return part ? 'נשאר להוסיף ' + description + '.' : 'אין במתכון כמות מדויקת לחישוב.';
  const left = total * (1 - share);
  const measurement = original.unit ? (left <= 1 ? unit(original.unit) : original.unit) : '';
  const amount = [Number(left.toFixed(4)), measurement, item.name].filter(v => v !== '').join(' ');
  return 'נשאר להוסיף ' + amount + (part ? ' (' + description + ')' : '') + '.';
}
function record(recipe: ActiveRecipe, state: States, step: number, item: RecipeIngredient, share: number): IngredientReply {
  // Reuse the app's matching and coupling to an explicit "add <ingredient>" action.
  // A broad mixing step cannot be completed by this ingredient report.
  const status: Progress = share === 1 ? 'done' : 'partial';
  const result = recipeTurn(recipe, state, step, 'שמתי ' + item.name);
  if (!result?.writes.some(w => w.action === item.id)) return clarify();
  if (status === 'done') return result.focus !== undefined ? result : { ...result, reply: 'רשמתי שהוספת את כל הכמות של ' + item.name + '.' };
  const writes = result.writes.map(w => ({ ...w, status }));
  const part = Array.from(fractions).find(([, value]) => value === share)?.[0];
  const amount = (part || Number((share * 100).toFixed(1)) + '%') + ' מהכמות';
  return { reply: 'רשמתי שהוספת ' + amount + ' של ' + item.name + '.', writes, portions: { [item.id]: share } };
}
export function ingredientTurn(recipe: ActiveRecipe, state: States, step: number, utterance: string,
  history: Turn[], portions: Portions): IngredientReply | undefined {
  const text = tidy(utterance);
  const question = /\?\s*$/.test(utterance);
  const known = (name: string) => resolve(recipe, name);
  const status = (item?: RecipeIngredient) => {
    if (!item) return clarify();
    const wording = { done: 'כבר סומן במלואו', partial: 'סומן חלקית', pending: 'עדיין לא סומן' };
    return read(item.name + ' ' + wording[state[item.id] || 'pending'] + '.');
  };
  const compound = /^(.+?)(?:,\s*|\s+)(?:ו)?(מה עוד נשאר להוסיף|מה נשאר לשים|מה עוד חסר|מה עכשיו|מה הלאה)\??$/.exec(utterance);
  if (compound && !/[?!]/.test(compound[1])) {
    const update = ingredientTurn(recipe, state, step, compound[1], history, portions) ?? recipeTurn(recipe, state, step, compound[1]);
    if (update?.writes.length) {
      const next = { ...state, ...Object.fromEntries(update.writes.map(w => [w.action, w.status])) };
      const followup = /עכשיו|הלאה/.test(compound[2]) ? compound[2] : 'מה נשאר להוסיף';
      const answer = recipeTurn(recipe, next, step, followup);
      if (answer) return { ...update, focus: answer.focus ?? update.focus, reply: update.reply + ' ' + answer.reply };
      return update;
    }
    if (update) return update;
  }
  const pronoun = /^(?:ו?כמה (?:ממנו|ממנה|מהן|מהם)(?: צריך)?|ו?מה הכמות (?:שלו|שלה|שלהן|שלהם))$/.test(text);
  if (pronoun) {
    const item = lastMention(recipe, history);
    return item ? read(item.label + '.') : clarify();
  }
  if (/^(?:טוב אז |אז )?(?:זרקתי|שמתי|הוספתי|מזגתי) (?:לקערה |לסיר )?בערך /.test(text)) {
    const item = lastMention(recipe, [{ role: 'user', content: text }]);
    return read(item ? 'כמה ' + item.name + ' הוספת בסך הכול? אפשר לציין מידה או חלק מהכמות שבמתכון.' : 'איזה מצרך הוספת ובאיזו כמות?');
  }
  const lastQuestion = history.at(-1)?.content;
  const previous = history.at(-2);
  if (lastQuestion?.startsWith('זו תוספת או הכמות הכוללת של ') && previous?.role === 'user' &&
    /^(?:זו |זאת )?(?:תוספת|הכמות הכוללת|בסך הכל|בסך הכול)$/.test(text)) {
    const restated = previous.content.replace(/^(שמתי|הוספתי|מזגתי|שמנו|הוספנו) /, '$1 ' + (text.endsWith('תוספת') ? 'עוד ' : 'בסך הכול '));
    if (restated !== previous.content) return ingredientTurn(recipe, state, step, restated, history.slice(0, -2), portions);
  }
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
    const item = !phrase || ['ממנו', 'ממנה', 'מזה', 'מנו', 'מנה', 'זה'].includes(phrase) ?
      lastMention(recipe, history) : known(phrase);
    if (!item) return clarify();
    if (state[item.id] === 'done') return read('כבר הוספת את כל הכמות של ' + item.name + '.');
    if (state[item.id] !== 'partial') return read('לפי הסימון נשאר להוסיף ' + item.label + '.');
    const share = portions[item.id];
    return read(share > 0 && share < 1 ? amountLeft(item, share) : item.name + ' סומן חלקית. לא תועד כמה הוספת.');
  }

  const unsure = /^(?:(?:רגע|שנייה)[, ]+)?(?:נראה לי|נדמה לי) ש(.+?) כבר (?:אצלי )?(?:בקערה|בסיר|בפנים)(?:[, ]+(?:נכון|שמת לב))?$/.exec(text);
  if (unsure) return status(known(unsure[1]));
  const separate = /^(?:(?:רק )?שלא נתבלבל[, ]+)?(?:הכנסתי|הוספתי|שמתי) (?:את )?([^,?!]+?)(?: (?:לקערה|לסיר))?[, ]+אבל (?:עדיין |עוד )?לא (ערבבתי|ערבבנו)$/.exec(text);
  if (separate) {
    const item = known(separate[1]);
    if (!item || question) return clarify();
    const update = recipeTurn(recipe, state, step, 'שמתי ' + item.name);
    if (!update?.writes.length) return clarify();
    const mixing = recipe.actions.filter(a => a.step === step && /^(?:לערבב|מערבבים)(?: |$)/.test(a.source));
    if (mixing.length === 1 && state[mixing[0].id] !== 'pending') {
      update.writes.push({ recipe_id: recipe.id, recipe_version: recipe.version, action: mixing[0].id, status: 'pending' });
    }
    return { ...update, reply: 'רשמתי שהוספת ' + item.name + '. הערבוב עדיין לפניך.' };
  }
  const fronted = /^(?:את )?([^,?!]+?) (?:כבר )?(?:הכנסתי|שמתי|הוספתי|הכנסנו|הוספנו) (?:ל(?:תוך ה)?קערה|בקערה|לסיר)(?:[, ]+(?:עוד )?נשאר (?:לי |לנו )?להוסיף (.+))?$/.exec(text);
  if (fronted) {
    const item = known(fronted[1]);
    if (!item) return clarify();
    if (question) return status(item);
    if (fronted[2] && /[,;.!?]|(?:^| )(?:אבל|ואז|שמתי|הוספתי|ערבבתי)(?: |$)/.test(fronted[2])) return clarify();
    const update = recipeTurn(recipe, state, step, 'שמתי ' + item.name);
    if (!update?.writes.length) return clarify();
    const next = { ...state, ...Object.fromEntries(update.writes.map(w => [w.action, w.status])) };
    return { ...update, reply: update.reply + (fronted[2] ? ' ' + recipeTurn(recipe, next, step, 'מה נשאר להוסיף')!.reply : '') };
  }
  const report = /^(?:(?:רגע[, ]+)?(?:בעצם|תיקון)[, ]+)?(?:אני )?(?:שמתי|הוספתי|מזגתי|שמנו|הוספנו) (.+)$/.exec(text);
  if (!report) return;
  const explicitTotal = /^(?:רגע[, ]+)?(?:בעצם|תיקון)[, ]/.test(text) || /^בסך (?:הכל|הכול) /.test(report[1]);
  let object = report[1].replace(/^בסך (?:הכל|הכול) /, '').replace(/^רק /, '');
  const more = object.startsWith('עוד ');
  if (more) object = object.slice(4);
  object = object.replace(/ (?:בקערה|לקערה|לסיר)$/, '');
  const fraction = /^(חצי|רבע|שלושה רבעים) מ(?:הכמות של )?(.+)$/.exec(object);
  const measured = parseIngredientLine(object);
  if (measured.quantity == null && /^(?:כוס|כף|כפית) /.test(object)) {
    Object.assign(measured, parseIngredientLine('1 ' + object));
  }
  const measuredQty = quantityAsNumber(measured);
  if (!fraction && !(measured.unit && measuredQty !== null)) {
    if (!question && /^(?:רגע[, ]+)?(?:בעצם|תיקון)[, ]/.test(text)) {
      return recipeTurn(recipe, state, step, 'שמתי ' + report[1]);
    }
    return;
  }
  if (question || /[?!;,]/.test(object)) return read('האם זו הכמות שכבר הוספת?');
  const item = fraction && ['מנו', 'מנה', 'הם', 'הן'].includes(fraction[2]) ?
    lastMention(recipe, history) : known(fraction ? fraction[2] : measured.name);
  if (!item) return clarify();
  const original = parseIngredientLine(item.label);
  const total = quantityAsNumber(original);
  if (!fraction && (unit(original.unit) !== unit(measured.unit) || (total === null || total <= 0))) {
    return read('הכמות במתכון היא ' + item.label + '. כמה מהכמות הזאת כבר הוספת?');
  }
  if (!more && !explicitTotal && (state[item.id] || 'pending') !== 'pending') {
    return read('זו תוספת או הכמות הכוללת של ' + item.name + ' שהוספת עד עכשיו?');
  }
  let share = fraction ? fractions.get(fraction[1])! : measuredQty! / total!;
  if (more) {
    const before = state[item.id] === 'partial' ? portions[item.id] : state[item.id] === 'done' ? 1 : 0;
    if (!Number.isFinite(before)) return read('לא תועד כמה הוספת קודם. מה הכמות הכוללת שהוספת עד עכשיו?');
    share += before;
  }
  if (!(share > 0 && share <= 1)) return read('הכמות המדווחת חורגת מהכמות שבמתכון. כמה הוספת בסך הכול?');
  return record(recipe, state, step, item, share);
}
