// Resolve explicit reports and recipe lookups against stable ingredient and instruction IDs.
import type { ActiveRecipe, Answer, Progress } from './compactEngine';

type States = Record<string, Progress>;
export type RecipeTurn = Answer & { focus?: number };
const nextQuestion = /^(?:(?:אז|ועכשיו|עכשיו|אוקיי|טוב) )*(?:מה (?:אני |אנחנו )?(?:צריך|צריכה|צריכים|אמור|אמורה) לעשות(?: עכשיו| בהמשך)?|מה (?:צריך|נותר|נשאר) לעשות|מה עושים(?: עכשיו| הלאה)?|מה (?:עכשיו|הלאה|השלב הבא|הצעד הבא)|איך ממשיכים)$/;
const mixAll = /^(?:לערבב|מערבבים|ערבבו) (?:את )?(?:הכול|הכל|כל (?:המצרכים|החומרים|הרכיבים|המרכיבים))(?: |$)/;
const tidy = (s: string) => s.normalize('NFKC').replace(/[\u0591-\u05bd\u05bf-\u05c7]/g, '').replace(/[.,!?:;…״"]/g, ' ').replace(/\s+/g, ' ').trim();
const noun = (s: string) => tidy(s).replace(/^את /, '').replace(/^ה/, '');

export function nextInstruction(recipe: ActiveRecipe, states: States, step: number): RecipeTurn {
  const open = recipe.actions.filter(a => states[a.id] !== 'done');
  const next = open.find(a => a.step >= step) ?? open[0];
  if (!next) return { reply: 'כל פעולות המתכון סומנו כבוצעו.', writes: [] };
  let reply = 'השלב הבא הוא ' + next.source.replace(/[.!]+$/, '') + '.';
  if (mixAll.test(tidy(next.source))) {
    const remaining = recipe.ingredients.filter(i => states[i.id] !== 'done');
    if (remaining.length) reply += ' מצרכים שעדיין לא סומנו במלואם: ' + remaining.map(i => i.name).join(', ') + '.';
  }
  return { reply, writes: [], focus: next.step };
}

function ingredientMatches(recipe: ActiveRecipe, phrase: string) {
  const target = noun(phrase);
  const exact = recipe.ingredients.filter(i => noun(i.name) === target || noun(i.label) === target ||
    noun(i.label.replace(/^1 (?=[א-ת])/, '')) === target);
  if (exact.length) return exact;
  return target ? recipe.ingredients.filter(i => noun(i.name).startsWith(target + ' ')) : [];
}

// Only complete, unambiguous clauses are applied directly. Questions and uncertain
// wording cannot reach this write path. Composite ingredients win over list splitting.
export function recipeTurn(recipe: ActiveRecipe, states: States, step: number, text: string): RecipeTurn | undefined {
  const clean = tidy(text);
  if (nextQuestion.test(clean)) return nextInstruction(recipe, states, step);

  if (recipe.ingredients.length && /^(?:מה (?:המצרכים|המרכיבים)|איזה (?:מצרכים|מרכיבים) צריך)(?: למתכון)?$/.test(clean))
    return { reply: 'המצרכים במתכון המקורי: ' + recipe.ingredients.map(i => i.label).join(', ') + '.', writes: [] };
  if (/^(?:מה (?:עוד )?(?:חסר|לא שמתי)|מה נשאר (?:לשים|להוסיף))$/.test(clean)) {
    const missing = recipe.ingredients.filter(i => states[i.id] !== 'done');
    return { reply: missing.length ? 'עדיין לא סומן: ' + missing.map(i => i.name).join(', ') + '.' : 'כל המצרכים סומנו.', writes: [] };
  }
  const statusQuery = clean.match(/^(?:האם |האם כבר |כבר )?(?:שמתי|הוספתי) (.+)$/);
  if (statusQuery && (clean.startsWith('האם ') || /\?\s*$/.test(text))) {
    const matches = ingredientMatches(recipe, statusQuery[1]);
    if (matches.length === 1) {
      const item = matches[0];
      const status = states[item.id];
      return { reply: item.name + (status === 'done' ? ' כבר סומן.' : status === 'partial' ? ' סומן חלקית.' : ' עדיין לא סומן.'), writes: [] };
    }
  }
  const amount = clean.match(/^כמה (.+?)(?: צריך(?: לשים| להוסיף)?| לשים| להוסיף| יש במתכון)?$/);
  if (amount) {
    const matches = ingredientMatches(recipe, amount[1]);
    if (matches.length === 1) return { reply: 'במתכון המקורי רשום ' + matches[0].label + '.', writes: [] };
  }

  const parts = clean.split(' ');
  const suffix = parts.findIndex((word, i) => i > 0 && /^(?:ו?מה|איך|ואיך|אז|עכשיו)$/.test(word) && nextQuestion.test(parts.slice(i).join(' ').replace(/^ו(?=מה|איך)/, '')));
  const report = suffix > 0 ? parts.slice(0, suffix).join(' ') : clean;
  if (text.includes('?') && (suffix < 0 || text.indexOf('?') !== text.trimEnd().length - 1)) return;
  const addition = report.match(/^(?:(?:אני|כבר) )?(?:(עוד לא|עדיין לא|לא) )?(?:שמתי|שמנו|הוספתי|הוספנו|הכנסתי|הכנסנו) (.+)$/);
  const changes = new Map<string, Progress>();
  let reply = '';
  if (addition) {
    const half = addition[2].match(/^(?:רק )?(?:חצי|חלק) (?:מ|מן )(.+)$/);
    const object = (half ? half[1] : addition[2]).replace(/ (?:בקערה|לקערה|לתוך הקערה)$/, '');
    if (half && addition[1]) return;
    const status = addition[1] ? 'pending' : half ? 'partial' : 'done';
    const whole = ingredientMatches(recipe, object);
    const phrases = whole.length ? [object] : object.split(/\s+ו(?=[א-ת])/);
    if (half && phrases.length > 1) return { reply: 'איזה מצרך הוספת רק בחלקו?', writes: [] };
    const names: string[] = [];
    for (const phrase of phrases) {
      const matches = ingredientMatches(recipe, phrase);
      if (matches.length !== 1) {
        if (matches.length > 1) return { reply: 'לאיזה מצרך התכוונת? ' + matches.map(i => i.name).join(' או ') + '?', writes: [] };
        // Let the model interpret more complex multi-clause reports.
        if (!recipe.ingredients.length || recipe.actions.some(a => tidy(a.source).split(' ').includes(noun(phrase)))) return;
        if (phrases.length > 1 || phrase.split(' ').length > 3 || /[.,;]/.test(text.trim().replace(/[.!?]+$/, ''))) return;
        return { reply: 'לא הצלחתי להתאים את ״' + phrase + '״ לרשימת המצרכים. איך הוא מופיע במתכון?', writes: [] };
      }
      const item = matches[0];
      names.push(item.name);
      changes.set(item.id, status);
      const actions = recipe.actions.filter(a => {
        const direct = tidy(a.source).match(/^(?:להוסיף|לשים) (.+)$/);
        return direct && [noun(item.name), noun(item.label)].includes(noun(direct[1]));
      });
      if (actions.length === 1 && actions[0].step === step) changes.set(actions[0].id, status);
    }
    reply = status === 'done' ? 'רשמתי שהוספת ' : status === 'partial' ? 'רשמתי שהוספת חלק מהכמות של ' : 'רשמתי שעדיין לא הוספת ';
    reply += names.join(' ו') + '.';
  } else if (/^(?:כבר )?ערבב(?:תי|נו) (?:את )?(?:הכל|הכול|כל המצרכים|כל החומרים)$/.test(report)) {
    const actions = recipe.actions.filter(a => a.step === step && mixAll.exec(tidy(a.source))?.[0] === tidy(a.source));
    if (actions.length !== 1) return;
    changes.set(actions[0].id, 'done');
    reply = 'סימנתי שהערבוב הסתיים.';
  } else return;

  const writes = Array.from(changes, ([action, status]) => ({ recipe_id: recipe.id, recipe_version: recipe.version, action, status }));
  const updated = { ...states, ...Object.fromEntries(changes) };
  const completedStep = recipe.actions.some(a => a.step === step && changes.get(a.id) === 'done') &&
    recipe.actions.filter(a => a.step === step).every(a => updated[a.id] === 'done');
  if (suffix < 0 && !completedStep) return { reply, writes };
  const next = nextInstruction(recipe, updated, step);
  return { writes, reply: reply + ' ' + next.reply, focus: next.focus };
}

export function questionOnly(text: string) {
  // An independent assertion can precede or follow a question in the same turn.
  if (/(?:^|[?!.,;]\s*)(?:(?:אני|כבר) )?[א-ת]+(?:תי|נו) [^?!.;]+[.,;!]\s*(?:מה|איך|אפשר|האם) |[?!.;]\s*(?:(?:אני|כבר) )?[א-ת]+(?:תי|נו) /.test(text)) return false;
  return /^(?:האם|מה|למה|איך|כמה|מתי|איפה|אפשר|איזה|איזו|במה)(?: |$)/.test(tidy(text)) ||
    (/\?\s*$/.test(text) && !/[,.;!]\s*(?:ו?מה|איך|אפשר|האם) /.test(text));
}
