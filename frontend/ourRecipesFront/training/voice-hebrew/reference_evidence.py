"""Conservative explicit reference-cue veto, not a full Hebrew semantic parser.

Only relative generic noun phrases, list-state cues and local marking cues are
recognized. Unknown language grants no extra authority. Never rebind an action,
derive a quantity, or change user state. A recognized conflicting cue only vetoes.
"""
import re
from evidence_guard import normalize
NOUNS={'פעולה','משימה','מטלה','עבודה','דבר','פריט','סעיף'}
PENDING={'חסר','חסרה','נותר','נותרה','נשאר','נשארה','ממתין','ממתינה','מחכה'}
OPEN={'ממתינות','ממתינים','פתוחות','פתוחים','ממתינה','ממתין','פתוח','פתוחה'}
CLOSED={'מושלמות','מושלמים','עשויות','עשויים','סגורות','סגורים','סגור','סגורה'}
MODIFIERS={'היה','היתה','הייתה','כבר','עדיין','עוד','לא','טרם','בעצם','כרגע','כאן','לי'}
MARKING={'סימנתי','סימנו','סימנת','סומן','סומנה','סומנו','מסומן','מסומנת','רשמתי','רשמנו','רשמת','רשום','רשומה','נרשם','נרשמה','מתועד','מתועדת','תועד','תועדה'}
NEGATIVE={'לא','טרם','אין','אינה','אינו','בלי','ללא'}
APPROVAL={'סימון','אישור','תיעוד'}
HAS={'יש','קיבל','קיבלה','קיבלו','קיבלתי','נושאת','נושא'}
COMPLETION={'מבוצע','מבוצעת','מושלם','מושלמת','גמור','גמורה','סגור','סגורה','בוצע','בוצעה','הסתיים','הסתיימה','סיום','השלמה','ביצוע'}


def relative(word):return word[1:] if word.startswith('ש') and len(word)>1 else word
def bare(word):
 word=relative(word)
 for prefix in ('ה','כ','ב','ל','מ'):
  if word.startswith(prefix) and word[1:] in NOUNS|OPEN|CLOSED|APPROVAL|COMPLETION|{'רשימת','רשימות'}:return word[1:]
 return word


def cues(text):
 evidence=[]
 for segment in re.split(r'[,;.!?]',text):
  words=normalize(segment).split()
  for i,word in enumerate(words):
   noun=bare(word) in NOUNS;neutral=word=='מה' and i+1<len(words) and words[i+1].startswith('ש')
   if not noun and not neutral:continue
   window=words[i+1:i+14]
   for j,w in enumerate(window):
    if w in ('אבל','אך','אולם','ואילו'):window=window[:j];break
   if not window:continue
   # Direct relative property: "מה שהיה חסר", "הפעולה שעדיין נותרה".
   connector=0 if neutral else next((j for j,w in enumerate(window[:3]) if w.startswith('ש')),None)
   if connector is not None:
    tail=[relative(window[connector])]+window[connector+1:]
    while tail and tail[0] in MODIFIERS:tail=tail[1:]
    if tail and tail[0] in PENDING:evidence.append({'reference':'remaining','cue':tail[0],'kind':'relative_property'})
   for j,w in enumerate(window):
    b=bare(w);before=[relative(v) for v in window[max(0,j-3):j]];after=[bare(v) for v in window[j+1:j+5]]
    if b in ('רשימת','רשימות'):
     values=set(after)
     if values&OPEN:evidence.append({'reference':'remaining','cue':w,'kind':'open_list'})
     if values&CLOSED:evidence.append({'reference':'marked','cue':w,'kind':'closed_list'})
    if b in MARKING and set(after)&COMPLETION:
     evidence.append({'reference':'remaining' if set(before)&NEGATIVE else 'marked','cue':w,'kind':'marking'})
    if b in APPROVAL and set(after)&COMPLETION:
     if set(before)&NEGATIVE:evidence.append({'reference':'remaining','cue':w,'kind':'absent_approval'})
     elif set(before)&HAS:evidence.append({'reference':'marked','cue':w,'kind':'present_approval'})
    if b=='סימון' or b.startswith('סימונ'):
     if set(after)&OPEN:evidence.append({'reference':'remaining','cue':w,'kind':'open_mark'})
     if set(after)&CLOSED:evidence.append({'reference':'marked','cue':w,'kind':'closed_mark'})
 return {'references':sorted({e['reference'] for e in evidence}),'evidence':evidence}


def validate(text,decision,joint):
 evidence=cues(text);refs=evidence['references'];kind,label=decision
 if len(refs)>1:return ('clarify',label),evidence
 if refs:
  if kind=='reference' and joint[label][0]!=refs[0]:return ('clarify',label),evidence
  # Preserve read-only legacy intents but forbid an unmeasured mutation on a
  # phrase that explicitly refers to generic recipe-state groups.
  if kind=='legacy':return ('readonly',label),evidence
 return decision,evidence
