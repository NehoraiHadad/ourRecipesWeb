/**
 * Detects waiting periods ("מניחים במשך 20 דקות") in the preparation steps so
 * the recipe view can offer a ready-made timer for each of them.
 *
 * Moved out of `RecipeDisplay` unchanged (same patterns, same defaults) — it
 * is plain text analysis over the already-parsed `instructions` field, not
 * recipe parsing: no section is extracted here and nothing is written back.
 */

export interface WaitInstruction {
  stepNumber: number;
  minutes: number;
  description: string;
}

const WAIT_PATTERNS: readonly RegExp[] = [
  // פעולות המתנה ישירות
  /(?:להמתין|לחכות|להשהות|לתת לנוח|להתפיח|לצנן)\s+(?:במשך\s+)?(\d+)?\s*(?:דקות|דק'|שעות|שעה)/i,
  // פעולות פסיביות שדורשות המתנה
  /(?:מניחים|משרים|משהים|מתפיחים|מצננים|מקררים|מחכים)\s+(?:במשך\s+)?(\d+)?\s*(?:דקות|דק'|שעות|שעה)/i,
  // ביטויי זמן
  /(?:במשך|למשך|ל|עד)\s+(\d+)\s*(?:דקות|דק'|שעות|שעה)/i,
  // זמן בתחילת המשפט
  /^(\d+)\s*(?:דקות|דק'|שעות|שעה)\s+(?:של\s+)?(?:המתנה|השהייה|הפסקה|צינון|קירור|התפחה)/i,
  // זמן בסוף המשפט
  /(?:ממתינים|מחכים|משאירים|משהים)\s+(?:בצד\s+)?(?:ל|עוד\s+)?(\d+)\s*(?:דקות|דק'|שעות|שעה)$/i,
  // פעולות מורכבות
  /(?:להניח ל|לתת ל|משאירים ל)(?:התקרר|התפיח|נוח|צנן)\s+(?:במשך\s+)?(\d+)?\s*(?:דקות|דק'|שעות|שעה)/i,
  // ביטויי זמן עם תיאור פעולה
  /(\d+)\s*(?:דקות|דק'|שעות|שעה)\s+(?:עד ש|על מנת ש|כדי ש)/i,
  // פעולות אחרי זמן מסוים
  /(?:לכבות|להוציא|לערבב|לבדוק|לטפל|לבשל|לאפות)\s+(?:את\s+)?(?:ה|זה\s+)?(?:אחרי|לאחר|כעבור|בתום)\s+(\d+)\s*(?:דקות|דק'|שעות|שעה)/i,
  // "אחרי/לאחר" בתחילת המשפט
  /^(?:אחרי|לאחר|כעבור|בתום)\s+(\d+)\s*(?:דקות|דק'|שעות|שעה)/i,
  // "להמשיך" עם זמן
  /(?:להמשיך|ממשיכים|נמשיך)\s+(?:לבשל|לאפות|לערבב)?\s+(?:עוד|ל|למשך)?\s*(\d+)\s*(?:דקות|דק'|שעות|שעה)/i
];

/** Turns a matched number into minutes, resolving hours and vague phrasings. */
function minutesFor(instruction: string, matched: string | undefined): number {
  let minutes = matched ? parseInt(matched, 10) : Number.NaN;

  if (instruction.includes('שעה') || instruction.includes('שעות')) {
    if (instruction.includes('חצי שעה')) minutes = 30;
    else if (instruction.includes('רבע שעה')) minutes = 15;
    else if (!matched && !instruction.includes('שעות')) minutes = 60;
    else if (minutes) minutes *= 60;
  }

  if (!minutes || Number.isNaN(minutes)) {
    if (instruction.includes('כמה דקות') || instruction.includes('מספר דקות')) minutes = 5;
    else if (instruction.includes('זמן קצר')) minutes = 3;
    else minutes = 0;
  }

  return minutes;
}

/** One entry per step that mentions a waiting period. */
export function detectWaitInstructions(instructions: string | null | undefined): WaitInstruction[] {
  if (!instructions) return [];

  const waitTimes: WaitInstruction[] = [];

  instructions.split('\n').forEach((instruction, index) => {
    for (const pattern of WAIT_PATTERNS) {
      const match = instruction.match(pattern);
      if (!match) continue;

      const minutes = minutesFor(instruction, match[1]);
      const stepNumber = index + 1;
      const alreadyFound = waitTimes.some(
        (wait) => wait.stepNumber === stepNumber && wait.minutes === minutes
      );

      if (minutes && !alreadyFound) {
        waitTimes.push({
          stepNumber,
          minutes,
          description: instruction.slice(0, 50) + (instruction.length > 50 ? '...' : '')
        });
      }
      break;
    }
  });

  return waitTimes;
}
