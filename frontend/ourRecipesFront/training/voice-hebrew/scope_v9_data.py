"""Compositional training augmentation; V8 dev/cal/test held byte-equivalent.
All additions are synthetic author-labelled, not naturally collected speech.
"""
import json,random
from corpus import ROOT,digest
from scope_v8_data import DATA as V8,SUBJECTS
from facts_v7 import ROOTS,JOINT
DATA=ROOT/'verification/scope-v9-data-20261112.json'
MODIFIERS=[
 ('שהסימון שלה עדיין מחכה להשלמה','שהסימון שלה כבר מציין השלמה'),
 ('שמופיעה ברשימת המשימות הפתוחות','שמופיעה ברשימת המשימות הסגורות'),
 ('שעדיין שייכת לרשימת הדברים שעוד צריך לעשות','שכבר שייכת לרשימת הדברים שנעשו'),
 ('שעדיין לא קיבלה תיעוד של סיום','שכבר קיבלה תיעוד של סיום'),
 ('שנמצאת בלי אישור שהושלמה','שנמצאת עם אישור שהושלמה'),
 ('שאין בסימון שלה אישור ביצוע','שיש בסימון שלה אישור ביצוע'),
 ('שרשומה בצד של מה שנותר','שרשומה בצד של מה שכבר בוצע'),
 ('שעדיין לא קיבלה את הסימן של בוצע','שכבר קיבלה את הסימן של בוצע'),
 ('שמצבה ברשימה עדיין פתוח','שמצבה ברשימה כבר סגור'),
 ('שממתינה ברשימה לאישור שהיא גמורה','שכבר קיבלה ברשימה אישור שהיא גמורה'),
 ('שטרם ציינתי עליה שבוצעה','שכבר ציינתי עליה שבוצעה'),
 ('שנשארה אצלי בלי סימון של השלמה','שנמצאת אצלי עם סימון של השלמה')]
OPS=(
 ('{}','אני מודיע בבירור: {}','מה שאני מדווח כרגע הוא: {}','לא סיימתי הכול, אבל אני כן מאשר ש{}','אני לא מדבר על שאר הדברים; {}','רק כדי לדייק, {}','בדקתי את המצב, והתוצאה היא ש{}','גם כשהמטבח עוד לא מסודר, {}','מה שלא הוטל בספק מבחינתי: {}','אני מאשר את הדיווח הבא: {}','אחרי בירור אני יודע ש{}','הנה הדיווח שלי על ההתקדמות: {}'),
 ('מה שאני לא מאשר הוא: {}','אינני אומר ש{}','אין בדבריי טענה ש{}','עוד נותר לבדוק, ואני נמנע מלקבוע ש{}','הניסוח הבא הוא ציטוט ולא דיווח שלי: {}','לא אישרתי בשום מקום ש{}','אני מברר אם {}; לא קבעתי שזה קרה','המחשבה ש{} אינה דיווח על מה שעשיתי','רק נתתי דוגמה לטענה: {}','אל תסיק מזה ש{}','האם אפשר לדעת אם {}?','אם יתברר ש{}, אעדכן אותך מאוחר יותר'),
 ('איני יכול לקבוע בוודאות אם {}','ייתכן בהחלט ש{}','אני מסופק בנוגע לאפשרות ש{}','אולי קרה ש{}','לא הצלחתי לוודא אם {}','אני לא משוכנע עדיין ש{}','אני מנסה להיזכר האם {}','האם {}? איני יודע את התשובה','אני חושב ש{}, אבל לא בטוח','אין לי ודאות ש{}','אני עוד צריך לוודא האם {}','יכול להיות ש{}, אבל זאת השערה בלבד'))


def build():
 data=json.loads(V8.read_text());train=data['splits']['train'];seen={r['text']:r['label'] for r in train};held_subjects={s for pair in SUBJECTS[12:] for s in pair}
 pairs=list(SUBJECTS[:12])+[tuple(noun+' '+m for m in pair) for noun in ('הפעולה','המשימה','המטלה','העבודה') for pair in MODIFIERS]
 pairs=list(dict.fromkeys(pairs));assert all(not(set(p)&held_subjects) for p in pairs)
 blocked={r['text'] for s in ('dev','calibration','test') for r in data['splits'][s]}
 blocked|={r['text'] for r in json.loads((ROOT/'verification/facts-v7-replay-data-20261112.json').read_text())['splits']['test']}
 blocked|={r['text'] for r in json.loads((ROOT/'verification/certainty-v5-data-20261112/language.json').read_text())['validation']}
 additions=[]
 for i,subjects in enumerate(pairs):
  for k in range(3):
   predicate_id=(i+4*k)%12;rng=random.Random(20261112+i*97+predicate_id*7);opids=rng.sample(range(12),4)
   for ref,subject in zip(('remaining','marked'),subjects):
    for status,predicate in zip(('complete','incomplete','partial'),ROOTS[predicate_id]):
     claim=subject+' '+predicate
     for commitment,operators in zip(('asserted','nonassertion','uncertain'),OPS):
      fact=(ref,commitment,'unspecified' if commitment=='nonassertion' else status);label=JOINT.index(fact)
      for opid in opids:
       text=operators[opid].format(claim)
       if text in blocked:raise ValueError('Held exact text in train')
       if text in seen:
        if seen[text]!=label:raise ValueError('Contradictory label')
        continue
       row={'id':f'composition-{len(additions)}','text':text,'group':f'composition-subject-{i}','label':label,'semantics':fact,'subject_pair':i,'predicate_family':predicate_id,'operator_family':opid,'new_composition':True}
       additions.append(row);seen[text]=label
 data['splits']['train']+=additions;data.update(schema='scope-v9',source_v8_sha256=digest(V8.read_bytes()),composition={'subject_pairs':len(pairs),'predicate_families_per_subject':3,'operators_per_kind_per_combination':4,'added_train':len(additions),'base_train':2116,'dev_calibration_test_unchanged':True,
 'note':'New structural training variants chosen after consumed V8 development failures. Exact held texts and held subject strings excluded, but structure/lexical overlap exists; not independent natural language data.'})
 return data

if __name__=='__main__':
 d=build();DATA.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(d['composition']);print({s:len(r) for s,r in d['splits'].items()})
