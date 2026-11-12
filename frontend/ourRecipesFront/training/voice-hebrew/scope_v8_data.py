"""Preregistered scope/reference contrasts, new roots, no copied failure texts.
Synthetic author labels, not reviewed natural speech. V7 sealed tests unchanged.
"""
import json
from collections import Counter
from corpus import ROOT,digest
from facts_v7 import JOINT,ROOTS
from facts_v7_replay import REPLAY
DATA=ROOT/'verification/scope-v8-data-20261112.json'
SUBJECTS=[
 ('הפעולה שעוד מחכה לביצוע כאן','הפעולה שרשומה כאן כמבוצעת'),
 ('המשימה שעדיין לא קיבלה אישור ביצוע','המשימה שכבר קיבלה אישור ביצוע'),
 ('המטלה שהסימון שלה עדיין פתוח','המטלה שהסימון שלה כבר סגור'),
 ('הפעולה שעדיין מופיעה אצלי כחסרה','הפעולה שכבר מופיעה אצלי כעשויה'),
 ('המשימה שטרם קיבלה סימון של סיום','המשימה שכבר קיבלה סימון של סיום'),
 ('העבודה שרשומה אצלי לביצוע','העבודה שרשומה אצלי כגמורה'),
 ('הפעולה שטרם סימנתי כגמורה','הפעולה שכבר סימנתי כגמורה'),
 ('המשימה שעוד נשארה לי כאן','המשימה שכבר סימנתי כמבוצעת'),
 ('המטלה שאין לצדה אישור שהסתיימה','המטלה שיש לצדה אישור שהסתיימה'),
 ('הפעולה שעדיין ללא סימון ביצוע','הפעולה שכבר נושאת סימון ביצוע'),
 ('המשימה ששמורה ברשימת הדברים שעוד חסרים','המשימה ששמורה ברשימת הדברים שכבר נעשו'),
 ('העבודה שעוד מתועדת כממתינה','העבודה שכבר מתועדת כעשויה'),
 ('הפעולה שעוד מופיעה ברשימת הממתינות','הפעולה שכבר מופיעה ברשימת העשויות'),
 ('המשימה שאין לה עדיין סימון סיום','המשימה שיש לה כבר סימון סיום'),
 ('המטלה שעדיין אינה מסומנת כמבוצעת','המטלה שכבר מסומנת כמבוצעת'),
 ('העבודה שחסרה לי לביצוע בחלק הזה','העבודה שרשמתי שהסתיימה בחלק הזה'),
 ('הפעולה שטרם נרשמה כמבוצעת','הפעולה שכבר נרשמה כמבוצעת'),
 ('המשימה שעוד אין לידה סימון ביצוע','המשימה שכבר יש לידה סימון ביצוע'),
 ('המטלה שמשויכת לרשימת הממתינות שלי','המטלה שמשויכת לרשימת המושלמות שלי'),
 ('העבודה שלא סימנתי כסגורה בשלב הזה','העבודה שסימנתי כסגורה בשלב הזה'),
 ('הפעולה שעוד זקוקה לסימון שהסתיימה','הפעולה שנושאת אצלי אישור שסיימתי אותה'),
 ('המשימה שעוד לא קיבלה תיעוד של ביצוע','המשימה שכבר קיבלה תיעוד של ביצוע'),
 ('המטלה שנותרה ברשימת העבודה לביצוע','המטלה שנרשמה ברשימת העבודה שבוצעה'),
 ('העבודה שסימונה עדיין ממתין לאישור','העבודה שסימונה כבר מאשר את ביצועה'),
]
OPS={
 'train':(
 ('{}','אני מאשר כעת ש{}','למרות שלא סיימתי את שאר ההכנות, {}','עוד לא סידרתי את המטבח, אבל {}'),
 ('איני מאשר כעת ש{}','עוד לא הגעתי לסוף העבודה, ולכן איני מאשר ש{}','אני רק בודק את העניין; איני מדווח ש{}','אין להסיק מהדברים שלי ש{}'),
 ('אני לא יכול לדעת אם {}','לא זכור לי אם {}','אני צריך לברר אם {}','יש לי ספק אם {}')),
 'dev':(
 ('אני מדווח בבירור ש{}','אני מאשר כאן ש{}','טרם סידרתי את הכלים, אבל {}','עוד לא גמרתי את כל ההכנות, ובכל זאת {}'),
 ('אני לא מאשר כאן ש{}','העבודה עדיין באמצע, ואיני קובע ש{}','כרגע אני רק בודק ולא מדווח ש{}','לא נובע מהדיווח שלי ש{}'),
 ('אני עדיין לא יודע אם {}','איני זוכר כרגע אם {}','נותר לי לברר האם {}','אני מטיל ספק בכך ש{}')),
 'calibration':(
 ('אחרי שבדקתי, אני מאשר ש{}','אני יכול לאשר ש{}','עדיין לא ניקיתי את השיש, אך {}','גם אם לא סיימתי את שאר המתכון, {}'),
 ('איני יכול לאשר ש{}','אני רק באמצע ההכנות ואיני מצהיר ש{}','טרם בדקתי, לכן אין כאן דיווח ש{}','מה שאיני טוען הוא ש{}'),
 ('אין לי דרך לדעת כרגע אם {}','לא הצלחתי להיזכר האם {}','אצטרך לבדוק האם {}','אני מסופק כרגע אם {}')),
 'test':(
 ('אני מאשר בלי ספק ש{}','בדקתי וראיתי ש{}','עוד לא ארגנתי את שאר המצרכים, אבל {}','למרות שנותרו עוד עבודות אחרות, {}'),
 ('אין כאן אישור מצדי ש{}','ההכנות עוד נמשכות ובשלב הזה איני מדווח ש{}','טרם סיימתי לבדוק, ואין להסיק ש{}','לא הודעתי בשום שלב ש{}'),
 ('אני עוד לא בטוח האם {}','הזיכרון שלי אינו מספיק כדי לדעת אם {}','צריך עוד בירור כדי לדעת אם {}','איני משוכנע ש{}')),
}

def build():
 old=json.loads(REPLAY.read_text());result={s:list(old['splits'][s]) for s in ('train','dev','calibration')};result['test']=[]
 for i,subjects in enumerate(SUBJECTS):
  split='train' if i<12 else ('dev' if i<16 else ('calibration' if i<20 else 'test'))
  for ref,subject in zip(('remaining','marked'),subjects):
   for status,predicate in zip(('complete','incomplete','partial'),ROOTS[i]):
    claim=subject+' '+predicate
    for c,wrappers in zip(('asserted','nonassertion','uncertain'),OPS[split]):
     for op in wrappers:
      fact=(ref,c,'unspecified' if c=='nonassertion' else status)
      result[split].append({'id':f'scope-{split}-{len(result[split])}','text':op.format(claim),'group':f'scope-root-{i}','label':JOINT.index(fact),'semantics':fact,'claim':claim,'operator':op,'new_scope':True})
 # Compare texts and group identities across all new splits; compare TRAIN to
 # all retained sealed V7 test texts and consumed V5 validation to avoid copying.
 texts={};groups={}
 for split,rows in result.items():
  for r in rows:
   norm=' '.join(r['text'].split())
   if norm in texts and texts[norm]!=split:raise ValueError('Cross-split text: '+norm)
   if r['group'] in groups and groups[r['group']]!=split:raise ValueError('Cross-split group')
   texts[norm]=split;groups[r['group']]=split
 blocked={r['text'] for r in old['splits']['test']}
 blocked|={r['text'] for r in json.loads((ROOT/'verification/certainty-v5-data-20261112/language.json').read_text())['validation']}
 assert not blocked&{r['text'] for r in result['train']}
 return {'schema':'scope-v8','synthetic':True,'human_reviewed':False,'joint_classes':JOINT,'splits':result,
 'source_replay_sha256':digest(REPLAY.read_bytes()),'design':'Root contains both references/all statuses/all speech acts. Distinct subjects/predicates/operators by split. New train avoids consumed V5 validation and sealed V7 test exact texts. New V8 test is scope-only, no OTHER.',
 'retained':'V7-replay train1252/dev205/calibration205 retained exactly. Its test205 remains sealed and is not the V8 test.'}

if __name__=='__main__':
 d=build();DATA.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print({s:{'texts':len(r),'new_scope':sum(x.get('new_scope',False) for x in r),'classes':dict(Counter(x['label'] for x in r))} for s,r in d['splits'].items()})
