export type RecipeVoiceCommand = 'next' | 'previous' | 'repeat' | 'stop' | 'restart' | 'unknown';

/** Explicit navigation commands only; never guess ingredient completion or invent recipe steps. */
export function recipeVoiceCommand(transcript: string): RecipeVoiceCommand {
  const text = transcript.normalize('NFKC').replace(/[\u0591-\u05c7]/g, '').replace(/[^א-תa-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/(?:אל|לא)\s+(?:תמשיך|תמשיכי|להמשיך|תעבור|תעברי)/.test(text)) return 'unknown';
  if (/(?:^|\s)(?:עצור|עצרי|עצירה|הפסק|הפסיקי|תפסיק|תפסיקי)(?:\s|$)/.test(text)) return 'stop';
  if (/מההתחלה|מהתחלה|התחל מחדש|התחילי מחדש/.test(text)) return 'restart';
  if (/שלב (?:ה)?קודם|אחורה/.test(text)) return 'previous';
  if (/חזור|חזרי|תחזור|תחזרי|שוב|עוד פעם|מה השלב הנוכחי/.test(text)) return 'repeat';
  if (/מה עכשיו|מה הלאה|מה השלב הבא|השלב הבא|שלב הבא|הבא בתור|אפשר להמשיך|תמשיך|תמשיכי/.test(text)) return 'next';
  return 'unknown';
}
