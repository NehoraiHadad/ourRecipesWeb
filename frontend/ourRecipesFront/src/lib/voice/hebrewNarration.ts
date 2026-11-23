// Speak common written recipe quantities before sending ordinary Hebrew to ReNikud.
const digits = ['אפס','אחת','שתיים','שלוש','ארבע','חמש','שש','שבע','שמונה','תשע'];
const tens = ['','','עשרים','שלושים','ארבעים','חמישים','שישים','שבעים','שמונים','תשעים'];
const thousands = ['','אלף','אלפיים','שלושת אלפים','ארבעת אלפים','חמשת אלפים','ששת אלפים','שבעת אלפים','שמונת אלפים','תשעת אלפים'];
const fractions: Record<string,string> = { '1/2':'חצי','1/3':'שליש','2/3':'שני שלישים','1/4':'רבע','3/4':'שלושה רבעים' };
const glyphs: Record<string,string> = { '½':'1/2','⅓':'1/3','⅔':'2/3','¼':'1/4','¾':'3/4','⅛':'1/8','⅜':'3/8','⅝':'5/8','⅞':'7/8' };

function integer(n: number): string {
  if (!Number.isInteger(n) || n > 9999) throw Error('המספר מחוץ לטווח ההקראה של נועה. אפשר לקרוא אותו במסך.');
  if (n < 10) return digits[n];
  if (n < 20) return n === 10 ? 'עשר' : (n === 12 ? 'שתים' : digits[n-10]) + ' עשרה';
  const unit = n < 100 ? 10 : n < 1000 ? 100 : 1000;
  const count = Math.floor(n/unit);
  const head = unit === 10 ? tens[count] : unit === 1000 ? thousands[count] :
    count === 1 ? 'מאה' : count === 2 ? 'מאתיים' : digits[count] + ' מאות';
  const rest = n % unit;
  return rest ? head + (rest < 20 || (rest % 10 === 0 && rest < 100) ? ' ו' : ' ') + integer(rest) : head;
}

function fraction(numerator: string, denominator: string) {
  if (!Number(denominator)) throw Error('אי אפשר להקריא שבר עם מכנה אפס.');
  return fractions[numerator+'/'+denominator] ?? (integer(Number(numerator)) + ' חלקי ' + integer(Number(denominator)));
}

export function normalizeHebrewSpeech(source: string) {
  const masculine = ['אפס','אחד','שניים','שלושה','ארבעה','חמישה','שישה','שבעה','שמונה','תשעה','עשרה'];
  const stepNumber = (n: string) => masculine[Number(n)] ?? integer(Number(n));
  let text = source.replace(/^שלב (\d+) מתוך (\d+)\./,(_,current,total) =>
    'שלב '+stepNumber(current)+' מתוך '+stepNumber(total)+'.')
    .replace(/\b\d{1,3}(?:,\d{3})+\b/g,n => n.replace(/,/g,''))
    .replace(/°\s*C\b/gi,' מעלות צלזיוס ').replace(/°\s*F\b/gi,' מעלות פרנהייט ')
    .replace(/(^|\s)([ולבכמשה])[-־](?=\d)/g,'$1$2')
    .replace(/(\d)\s*[-–—]\s*(?=\d)/g,'$1 עד ').replace(/-\s*(?=\d)/g,'מינוס ')
    .replace(/([½⅓⅔¼¾⅛⅜⅝⅞])/g,(_,g: string) => ' '+glyphs[g]+' ');
  if (/[a-zA-Z]|\d\s*:\s*\d/.test(text)) throw Error('נועה תומכת בטקסט עברי ובכמויות. אפשר לקרוא את הטקסט המקורי במסך.');
  text = text.replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g,(_,w,n,d) => integer(Number(w))+' ו'+fraction(n,d))
    .replace(/(\d+)\s*\/\s*(\d+)/g,(_,n,d)=>fraction(n,d))
    .replace(/\d+(?:\.\d+)?/g,raw=>{
      const [whole,decimal] = raw.split('.');
      return integer(Number(whole)) + (decimal ? ' נקודה ' + decimal.split('').map(d=>digits[Number(d)]).join(' ') : '');
    }).replace(/%/g,' אחוזים ').replace(/°/g,' מעלות ').replace(/[•·]/g,', ').replace(/־/g,' ');
  if (/[^\u0590-\u05ff\s.,;:!?()'"״׳\-–—]/.test(text)) throw Error('יש סימן שאינו נתמך בהקראה. הטקסט המקורי זמין במסך.');
  return text.replace(/שתיים (?=כפות|כפיות|כוסות|דקות|שעות|מעלות|יחידות)/g,'שתי ').replace(/\s+/g,' ').trim();
}
