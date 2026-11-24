// Spoken guidance is derived from the recipe. Action IDs and the original instructions stay intact.
import type { Action, ActiveRecipe, Progress, RecipeIngredient } from './compactEngine';

type States = Record<string, Progress>;
const combine = /^(לערבב|מערבבים|ערבבו|לטרוף|טורפים|ללוש|לשים יחד|לטחון)(?:\s+(?:יחד\s+)?(?:את\s+)?(?:הכול|הכל|כל (?:המצרכים|החומרים|הרכיבים|המרכיבים)))?(?=$|[.,!;:]|\s+(?:עד|היטב|במשך|בקערה|במיקסר|במעבד|בעדינות|במהירות)(?:\s|$))/;
const mixVerb = /^(?:לערבב|מערבבים|ערבבו|לטרוף|טורפים|ללוש|לשים יחד|לטחון)(?:\s|$)/;
const extraRole = /(?:^|[\s(:-])(?:לציפוי|למילוי|למלית|לקרם|לקישוט|לפיזור|להגשה|לשימון|לטיגון|להברשה)(?=$|[\s):,-])/;
const baseHeading = /^(?:מצרכים |מרכיבים )?ל?(?:בלילה|בצק|תערובת|בסיס|עוגה|פנקייק)(?: בלבד)?\s*:?$/;
const sectionHeading = /^(?:מצרכים |מרכיבים )?ל?(?:ציפוי|מילוי|מלית|קרם|קישוט|פיזור|הגשה|שימון|טיגון|הברשה)\s*:?$/;
const separateComponent = /(?:^|\s)(?:את |ל|ה)?(?:מלית|מילוי|קרם|ציפוי|רוטב|גנאש)(?=$|[\s.,:])/;
// An exception or a separate bowl narrows "everything" in the source itself.
const restrictedMix = /(?:חוץ מ|פרט ל|למעט|מלבד|בלי |ללא |בנפרד|קערה (?:נפרדת|אחרת)|שומרים בצד)/;
function collectiveMix(source: string) {
  if (restrictedMix.test(source)) return null;
  const match = combine.exec(source);
  if (match && match[0] === match[1]) {
    // “Mix well” lacks an object, but “mix well the eggs” already names it.
    const tail = source.slice(match[0].length).trim();
    if (!/^(?:(?:היטב|בעדינות|בקערה|במיקסר)(?: |$))*(?:(?:עד|במשך) .+)?$/.test(tail)) return null;
  }
  return match;
}

const nameList = (items: string[]) => items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' ו' + items[items.length - 1];
const words = (text: string) => text.replace(/[^א-ת\s]/g, ' ').trim().split(/\s+/);

function mentions(source: string, name: string) {
  const tokens = words(source);
  const target = words(name);
  return !!target[0] && tokens.some((token, i) =>
    [token, token.replace(/^[ובלהמ]/, ''), token.replace(/^(?:וה|בה|לה)/, '')].includes(target[0]) &&
    target.slice(1).every((w, j) => w === tokens[i + j + 1]));
}

// An unqualified collective at the beginning can refer to the main ingredient list.
// Keep separately labelled components and ingredients explicitly added later out of it.
function mixingIngredients(recipe: ActiveRecipe, action: Action) {
  const index = recipe.actions.findIndex(a => a.id === action.id);
  const later = recipe.actions.slice(index + 1);
  const earlier = recipe.actions.slice(0, index);
  const previousPrep = earlier.filter(a => !/^(?:לחמם|מחממים|לשמן|לרפד|להכין תבנית)/.test(a.source));
  if (previousPrep.length) {
    // A run of additions to the same bowl provides a nearer referent than the whole recipe.
    const named = new Set<RecipeIngredient>();
    for (const a of previousPrep) {
      if (!/^(?:להוסיף|מוסיפים|לשים|שמים|להניח|מניחים) /.test(a.source) ||
          /בצד|אחרת|נפרד|מחבת|תבנית|סיר/.test(a.source)) return;
      const found = recipe.ingredients.filter(i => !extraRole.test(i.label) && mentions(a.source, i.name));
      if (!found.length) return;
      found.forEach(i => named.add(i));
    }
    return { items: Array.from(named), serving: [] };
  }
  let inBase = true;
  let grouped = false;
  const items: RecipeIngredient[] = [];
  const serving: RecipeIngredient[] = [];
  for (const item of recipe.ingredients) {
    const name = item.name.trim();
    if (name.endsWith(':') || (name.startsWith('ל') && (baseHeading.test(name) || sectionHeading.test(name)))) {
      inBase = baseHeading.test(name) || /^(?:מצרכים|חומרים|מרכיבים):$/.test(name);
      grouped = true;
      continue;
    }
    if (!inBase || extraRole.test(item.label)) continue;
    const reserved = later.some(a => mentions(a.source, name) &&
      /^(?:להוסיף|מוסיפים|להניח בצד|לפזר|לקשט|לצפות|למלא|לשמן|להבריש|לטגן ב)/.test(a.source));
    if (reserved) continue;
    if (!grouped && later.some(a => /^(?:להגיש|מגישים|להוסיף בהגשה)/.test(a.source) && mentions(a.source, name))) {
      serving.push(item);
    } else items.push(item);
  }
  if (!grouped && later.some(a => !/^להגיש /.test(a.source) &&
      (separateComponent.test(a.source) || /קערה (?:אחרת|נפרדת)|שתי התערובות/.test(a.source)))) return;
  return { items, serving };
}

export function describeAction(recipe: ActiveRecipe, action: Action, progress: States, quantities = false) {
  const source = action.source.trim().replace(/[.!]+$/, '');
  const collective = collectiveMix(source);
  if (collective) {
    const scope = mixingIngredients(recipe, action);
    if (!scope?.items.length) return source + '. המתכון לא מפרט אילו מצרכים שייכים לערבוב בשלב הזה.';
    const { items, serving } = scope;
    const note = serving.length ? ' המתכון מזכיר גם ' + nameList(serving.map(i => quantities ? i.label : i.name)) +
      ' בהגשה. הכמות לערבוב לא מפורטת בנפרד.' : '';
    const remaining = items.filter(i => progress[i.id] !== 'done');
    const list = (selected: RecipeIngredient[]) => nameList(selected.map(i => quantities ? i.label : i.name));
    const instruction = source.replace(collective[0], () => collective[1].replace(/ יחד$/, '') + ' יחד ' + list(items)) + '.';
    if (!quantities && remaining.length && remaining.length < items.length) {
      return instruction + ' עוד לא סומנו במלואם: ' + list(remaining) + '.' + note;
    }
    return instruction + note;
  }
  if (/^(?:לטגן|אופים|לאפות|מטגנים)$/.test(source)) {
    const index = recipe.actions.findIndex(a => a.id === action.id);
    if (index > 0 && mixVerb.test(recipe.actions[index - 1].source)) return source + ' את התערובת מהשלב הקודם.';
  }
  return source + '.';
}

export function narratedSteps(recipe: ActiveRecipe, steps: string[], progress: States) {
  return steps.map((line, step) => {
    const actions = recipe.actions.filter(a => a.step === step);
    // Preserve the sentence as written when there is nothing to expand.
    const descriptions = actions.map(a => describeAction(recipe, a, progress));
    if (actions.some((a, i) => descriptions[i] !== a.source.trim().replace(/[.!]+$/, '') + '.')) return descriptions.join(' ');
    return line;
  });
}

export function stepClarification(recipe: ActiveRecipe, step: number, question: string): string | undefined {
  const current = recipe.actions.filter(a => a.step === step);
  if (/^(?:מה הכוונה|מה זה אומר|אפשר לפרט|איך עושים את (?:זה|השלב הזה))$/.test(question) && current.length) {
    return current.map(a => describeAction(recipe, a, {})).join(' ');
  }
  const wantsMix = /^(?:(?:רגע|אז) )?(?:מה (?:בדיוק )?(?:(?:(?:אני |אנחנו )?(?:צריך|צריכה|צריכים|אמור|אמורה|אמורים) )?לערבב|מערבבים|לטרוף|טורפים|ללוש|לטחון)|(?:איזה|אילו) (?:מצרכים|חומרים|מרכיבים) (?:לערבב|מערבבים|להכניס|לשים)(?: (?:בקערה|בבלילה|בתערובת))?|מה (?:נכנס|שמים) (?:לבלילה|לערבוב|בקערה)|מה הכוונה (?:בהכל|בהכול|בלערבב הכל)|מה זה (?:הכל|הכול))(?: (?:יחד|עכשיו|כאן|בדיוק))?$/;
  const amounts = /^(?:ו?כמה (?:לשים |צריך )?מכל (?:מצרך|דבר|אחד)|(?:ו?מה|ומהן) הכמויות)(?: (?:לערבוב|לבלילה|בשלב הזה))?$/.test(question);
  if (wantsMix.test(question) || amounts) {
    let actions = current.filter(a => mixVerb.test(a.source));
    if (!actions.length && !amounts) {
      const candidates = recipe.actions.filter(a => mixVerb.test(a.source));
      if (candidates.length === 1) actions = candidates;
    }
    if (actions.length) {
      if (amounts && actions.some(a => restrictedMix.test(a.source))) {
        return 'אין במתכון רשימת כמויות נפרדת לערבוב הזה. ההוראה היא ' + actions.map(a => a.source).join(', ') + '.';
      }
      if (amounts && actions.every(a => !collectiveMix(a.source))) {
        const named = recipe.ingredients.filter(i => actions.some(a => mentions(a.source, i.name)));
        if (named.length) return 'לפי רשימת המצרכים במתכון המקורי: ' + nameList(named.map(i => i.label)) + '.';
      }
      const reply = actions.map(a => describeAction(recipe, a, {}, amounts)).join(' ');
      return amounts ? 'לפי המתכון המקורי: ' + reply : reply;
    }
    if (!amounts) return 'בשלב הזה לא מפורט מה לערבב. ההוראה היא ' + current.map(a => a.source).join(', ') + '.';
  }
  const detail = /^(?:כמה זמן|לכמה זמן|באיזו טמפרטורה|באיזה חום|על איזה חום)(?: (?:צריך |כדאי )?(לטגן|לאפות|לבשל))?$/.exec(question);
  if (detail) {
    const action = detail[1] ? current.find(a => a.source.includes(detail[1]!)) : current.length === 1 ? current[0] : undefined;
    if (!action) return;
    const time = question.includes('זמן');
    const provided = time ? /(?:דקות|דקה|דק[׳']|שניות|שעות|שעה|שעתיים)/ : /(?:מעלות|חום (?:גבוה|נמוך|בינוני)|אש (?:גבוהה|נמוכה|בינונית))/;
    if (!time && !provided.test(action.source) && /^(?:לאפות|אופים)/.test(action.source)) {
      const oven = recipe.actions.slice(0, recipe.actions.indexOf(action)).reverse()
        .find(a => /תנור/.test(a.source) && /לחמם|מחממים|חום|להנמיך|להעלות|לכבות/.test(a.source));
      if (oven && provided.test(oven.source)) return 'בהוראת התנור כתוב: ' + oven.source + '.';
    }
    return provided.test(action.source) ? 'לפי ההוראה, ' + action.source + '.' :
      (time ? 'משך הזמן' : 'החום') + ' לא מצוין בהוראה. כך כתוב במתכון: ' + action.source + '.';
  }
}
