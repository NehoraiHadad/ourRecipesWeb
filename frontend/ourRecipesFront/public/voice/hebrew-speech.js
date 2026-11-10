// Exact numeric value verbalization for Pocket npm 0.1.0, which predates the
// upstream number normalizer. Grammar gender is neutral/feminine. Never round.
const digits = ['אפס', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע'];
function integer(raw) {
  const n = Number(raw);
  if (n > 9999 || !Number.isInteger(n)) throw new Error('המספר מחוץ לטווח ההקראה הניסיונית. אפשר לקרוא את הטקסט או להשתמש בקול המכשיר.');
  if (n < 10) return digits[n];
  if (n < 20) return n === 10 ? 'עשר' : `${n === 12 ? 'שתים' : digits[n - 10]} עשרה`;
  if (n < 100) return [['', '', 'עשרים', 'שלושים', 'ארבעים', 'חמישים', 'שישים', 'שבעים', 'שמונים', 'תשעים'][Math.floor(n / 10)], n % 10 ? `ו${digits[n % 10]}` : ''].filter(Boolean).join(' ');
  if (n < 1000) return [n < 200 ? 'מאה' : n < 300 ? 'מאתיים' : `${digits[Math.floor(n / 100)]} מאות`, n % 100 ? integer(String(n % 100)) : ''].filter(Boolean).join(' ');
  return [n < 2000 ? 'אלף' : n < 3000 ? 'אלפיים' : `${digits[Math.floor(n / 1000)]} אלפים`, n % 1000 ? integer(String(n % 1000)) : ''].filter(Boolean).join(' ');
}
export function normalizeHebrewSpeech(source) {
  if (/[a-zA-Z]|\d\s*:\s*\d/.test(source)) throw new Error('הקראת Pocket בניסוי זה תומכת בעברית ובכמויות בלבד. לטקסט מעורב או שעות אפשר להשתמש בקול המכשיר או לקרוא את הטקסט.');
  let text = source.replace(/(\d+)\s*([½¼¾])/g, (_, whole, fraction) => `${integer(whole)} ו${({ '½': 'חצי', '¼': 'רבע', '¾': 'שלושה רבעים' })[fraction]}`).replace(/½/g, ' חצי ').replace(/¼/g, ' רבע ').replace(/¾/g, ' שלושה רבעים ');
  text = text.replace(/(\d+)\s+(1\/2|1\/4|3\/4)/g, (_, whole, fraction) => `${integer(whole)} ו${({ '1/2': 'חצי', '1/4': 'רבע', '3/4': 'שלושה רבעים' })[fraction]}`);
  text = text.replace(/\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?/g, range => range.replace(/[-–]/, ' עד '));
  text = text.replace(/(\d+)\s*\/\s*(\d+)/g, (_, numerator, denominator) => {
    if (Number(denominator) === 0) throw new Error('לא ניתן להקריא שבר עם מכנה אפס.');
    if (numerator === '1' && denominator === '2') return 'חצי';
    if (numerator === '1' && denominator === '4') return 'רבע';
    return `${integer(numerator)} חלקי ${integer(denominator)}`;
  });
  text = text.replace(/-\s*(\d)/g, 'מינוס $1').replace(/\d+(?:\.\d+)?/g, raw => {
    const [whole, decimal] = raw.split('.');
    return integer(whole) + (decimal ? ` נקודה ${decimal.split('').map(d => digits[Number(d)]).join(' ')}` : '');
  }).replace(/%/g, ' אחוזים ').replace(/°/g, ' מעלות ');
  if (/[^\u0590-\u05ff\s.,;:!?()'"״׳\-–—]/.test(text)) throw new Error('יש סימן שאינו נתמך בהקראה הניסיונית. הטקסט המקורי נשאר זמין.');
  return text.replace(/שתיים (?=כפות|כפיות|כוסות|דקות|שעות|מעלות|יחידות)/g, 'שתי ').replace(/\s+/g, ' ').trim();
}
