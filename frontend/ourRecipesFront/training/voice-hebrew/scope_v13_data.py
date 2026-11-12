"""Prospective commitment-veto data: operator families held out before training.
Naturalistic means authored text, never a recording or real-user validation.
Former V7 test is explicitly consumed TRAIN replay, not a fresh test anymore.
"""
import json,random
from collections import Counter
from corpus import ROOT,digest
from facts_v7 import JOINT,ROOTS
from scope_v9_data import DATA as OLD
DATA=ROOT/'verification/scope-v13-stance-data-20261112.json'

# (family, asserted, not asserted, denied commitment). Operators are grouped,
# so a template cannot cross splits by merely changing its action/predicate.
OPERATORS={
 'train':[
 ('checked_guess','בדקתי בעצמי: {c}','זו השערה בלבד: {c}','uncertain'),
 ('guess_denial','זה לא ניחוש שלי; {c}','למיטב הניחוש שלי {c}','uncertain'),
 ('certainty','אני בטוח ש{c}','אני לא בטוח ש{c}','uncertain'),
 ('doubt','אין לי ספק ש{c}','יש לי ספק אם {c}','uncertain'),
 ('memory','אני זוכר בבירור ש{c}','אני לא זוכר אם {c}','uncertain'),
 ('maybe','אני מאשר בוודאות ש{c}','אולי {c}','uncertain'),
 ('question','אני מודיע ש{c}','האם {c}?','nonassertion'),
 ('speech_denial','אני אומר במפורש ש{c}','לא אמרתי ש{c}','nonassertion'),
 ('hypothetical','זה המצב עכשיו: {c}','אם יתברר ש{c}, נמשיך אחר כך','nonassertion'),
 ('quote','הדיווח שלי על מה שעשיתי: {c}','אני רק מצטט מישהו שאמר ש{c}','nonassertion'),
 ('unrelated_prefix','אולי השיש רטוב, אבל {c}','השיש נקי, אבל ייתכן ש{c}','uncertain'),
 ('casual','טוב, וידאתי: {c}','אממ, נראה לי ש{c}, אבל לא בדקתי','uncertain'),
 ('suffix','{c}, ואני מאשר את זה','{c}, אבל אני לא משוכנע בזה','uncertain'),
 ('repair','קודם ניחשתי; עכשיו בדקתי: {c}','{c}; רגע, בעצם אני רק משער','uncertain'),
 ('inspection','הסתכלתי והמצב ברור: {c}','אני עוד צריך להסתכל כדי לדעת אם {c}','uncertain'),
 ('retraction','אני עומד בדיווח שלי: {c}','אני חוזר בי מהטענה ש{c}','nonassertion'),
 ('not_denying','אינני מכחיש את הדיווח שלי: {c}','אני מכחיש שדיווחתי ש{c}','nonassertion'),
 ('unrelated_question','איפה הכף? בכל מקרה, {c}','הכף כאן. רציתי לשאול אם {c}','nonassertion'),
 ('unrelated_suffix','{c}. לגבי השיש אני לא בטוח','{c}? לגבי זה אני לא בטוח','uncertain'),
 ('unrelated_condition','אם יהיה חם נפתח חלון; {c}','בהנחה ש{c}, מה צריך לעשות?','nonassertion')],
 'dev':[
 ('inspection_result','בדיקת המצב הראתה ש{c}','זה רק הרושם שלי ש{c}','uncertain'),
 ('verified_report','הדיווח מאומת: {c}','טרם וידאתי את האפשרות ש{c}','uncertain'),
 ('suffix_fact','{c}; זו עובדה שבדקתי','{c}; זה ניחוש לא בדוק','uncertain'),
 ('not_confirmed','לא לגבי משהו אחר; אני מאשר ש{c}','אני לא מאשר ש{c}','nonassertion')],
 'calibration':[
 ('commit','אני יכול להתחייב ש{c}','איני יכול להתחייב ש{c}','uncertain'),
 ('imaginary','המצב במציאות הוא כך: {c}','זה רק תרחיש דמיוני: {c}','nonassertion'),
 ('suffix_verify','{c}; בדקתי זאת ולא נותר ספק','{c}; צריך עוד לאמת את זה','uncertain'),
 ('weather_scope','אולי בחוץ יורד גשם. לגבי המתכון, {c}','בחוץ יורד גשם. לגבי המתכון, יכול להיות ש{c}','uncertain')],
 'test':[
 ('reliability','אפשר לסמוך על הדיווח הבא: {c}','לא הייתי סומך על ההערכה הבאה: {c}','uncertain'),
 ('reservation','{c}, ואני עומד מאחורי הדיווח','{c}, אך אני עדיין מסויג מהקביעה הזאת','uncertain'),
 ('guess_now','אני לא משער הפעם; {c}','אני רק משער הפעם ש{c}','uncertain'),
 ('supposition','נבדק ולא מדובר בסברה: {c}','מדובר בסברה שלי בלבד: {c}','uncertain'),
 ('finished_check','סיימתי לברר וכעת ידוע לי ש{c}','אולי יש סיכוי ש{c}, צריך לברר','uncertain'),
 ('physical_verify','{c}. זה מה שווידאתי פיזית','{c}. יכול להיות שאני טועה בנוגע לזה','uncertain'),
 ('question_denial','לא שאלה: אני מדווח ש{c}','זאת שאלה, לא דיווח: האם {c}?','nonassertion'),
 ('change_of_mind','קודם לא ידעתי מה המצב; עכשיו אני מאשר ש{c}','קודם חשבתי ש{c}, אבל עכשיו אני לא בטוח בכך','uncertain')]
}
SUBJECTS=[('הפעולה שנותרה','הפעולה שסומנה כמושלמת'),('המשימה שעדיין ממתינה','המשימה שכבר סומנה כמושלמת')]
PREDICATES={'train':(0,1,3,4),'dev':(2,5),'calibration':(6,7),'test':(8,9)}

# Explicitly authored challenge: colloquial order, repairs, unrelated clauses,
# clear partial reports, negated uncertainty, questions and quotations.
# Each row records target interpretation for audit, not as an inference input.
NATURAL=[
 ('אממ, אני רק מנחש שהפעולה שנותרה כבר גמורה','remaining','uncertain','complete'),
 ('מה שמסומן כמושלם עוד לא בוצע, ככה נדמה לי לפחות','marked','uncertain','incomplete'),
 ('רגע, אולי המשימה שעדיין ממתינה כבר נעשתה, אין לי מושג','remaining','uncertain','complete'),
 ('הדבר שסימנתי כגמור בכלל לא נעשה, אבל זאת רק ההערכה שלי','marked','uncertain','incomplete'),
 ('אנחנו מדברים על הפעולה שנותרה? יש מצב שסיימתי אותה, לא בדקתי','remaining','uncertain','complete'),
 ('אני מנסה להיזכר אם מה שסומן כמושלם בעצם עוד לא גמור','marked','uncertain','incomplete'),
 ('טוב, אל תתפוס אותי במילה, הפעולה שנותרה בוצעה','remaining','uncertain','complete'),
 ('יכול להיות שטעיתי בסימון והמשימה שסומנה כמושלמת עדיין לא נעשתה','marked','uncertain','incomplete'),
 ('אני נוטה לחשוב שהפעולה שנותרה הושלמה, אבל לא יכול לאשר','remaining','uncertain','complete'),
 ('לגבי מה שסומן כמושלם, כרגע אני לא יודע אם זה עוד לא בוצע','marked','uncertain','incomplete'),
 ('אה, זאת לא השערה: בדקתי והפעולה שנותרה גמורה','remaining','asserted','complete'),
 ('טוב, אין פה ניחוש, המשימה שסומנה כמושלמת עדיין לא נעשתה','marked','asserted','incomplete'),
 ('בדקתי ממש עכשיו: מה שנותר לביצוע כבר בוצע עד הסוף','remaining','asserted','complete'),
 ('אני מתקן את הסימון בוודאות, הפעולה שסומנה כמושלמת לא בוצעה','marked','asserted','incomplete'),
 ('אוקיי, אפשר להתקדם, המשימה שעדיין ממתינה כבר הושלמה','remaining','asserted','complete'),
 ('זאת לא שאלה, אני מדווח: מה שסומן כמושלם לא נעשה','marked','asserted','incomplete'),
 ('אני לא רק חושב ככה, ראיתי שהפעולה שנותרה בוצעה','remaining','asserted','complete'),
 ('הנה התיקון אחרי בדיקה: המשימה שכבר סומנה כמושלמת לא גמורה','marked','asserted','incomplete'),
 ('טוב, אני מאשר אחרי שהסתכלתי, הפעולה שנותרה גמורה לחלוטין','remaining','asserted','complete'),
 ('אין לי ספק אחרי הבדיקה, הפעולה שסומנה כמושלמת עדיין לא גמורה','marked','asserted','incomplete'),
 ('תגיד, האם הפעולה שנותרה כבר בוצעה עד הסוף?','remaining','nonassertion','unspecified'),
 ('רק שאלה: מה שסומן כמושלם בעצם לא נעשה?','marked','nonassertion','unspecified'),
 ('סתם ציטטתי את הטענה שהפעולה שנותרה הושלמה, לא דיווחתי','remaining','nonassertion','unspecified'),
 ('אם מה שסומן כמושלם לא בוצע, מה עושים? זו רק אפשרות','marked','nonassertion','unspecified'),
 ('עוד לא אמרתי שהפעולה שנותרה בוצעה, רק ביררתי','remaining','nonassertion','unspecified'),
 ('זאת דוגמה דמיונית למשפט שהמשימה שסומנה כמושלמת לא גמורה','marked','nonassertion','unspecified'),
 ('אל תרשום כלום, אני רק שואל אם הפעולה שנותרה כבר נעשתה','remaining','nonassertion','unspecified'),
 ('האם יש דרך לברר אם מה שסומן כמושלם עוד לא נעשה?','marked','nonassertion','unspecified'),
 ('אולי הכף ליד הכיור, אבל אני מאשר שהפעולה שנותרה בוצעה','remaining','asserted','complete'),
 ('לא זוכר איפה המגבת, אבל בדקתי שהמשימה שסומנה כמושלמת לא נעשתה','marked','asserted','incomplete'),
 ('יש לי ספק לגבי השיש; לגבי הפעולה שנותרה, היא הושלמה בוודאות','remaining','asserted','complete'),
 ('אולי הרדיו דולק. את הסימון אני מתקן: הפעולה שסומנה כמושלמת לא בוצעה','marked','asserted','incomplete'),
 ('הכף בכיור בוודאות, אבל אני רק מניח שהפעולה שנותרה הסתיימה','remaining','uncertain','complete'),
 ('המגבת כאן, אבל לא בטוח שמה שסומן כמושלם עדיין לא נעשה','marked','uncertain','incomplete'),
 ('השיש נקי, זה בדוק. המשימה שעדיין ממתינה אולי גמורה','remaining','uncertain','complete'),
 ('הרדיו דולק בוודאות. לגבי מה שסומן כמושלם, אני משער שלא בוצע','marked','uncertain','incomplete'),
 ('בהתחלה לא ידעתי, עכשיו בדקתי: הפעולה שנותרה כבר בוצעה','remaining','asserted','complete'),
 ('קודם ניחשתי שהכול תקין; בדקתי, ומה שסומן כמושלם לא נעשה','marked','asserted','incomplete'),
 ('הפעולה שנותרה גמורה, רגע, בעצם לא בדקתי ואני לא בטוח','remaining','uncertain','complete'),
 ('מה שסומן כמושלם לא נעשה, רגע, זאת רק מחשבה שעברה לי בראש','marked','uncertain','incomplete'),
 ('הייתי מסופק קודם, אבל עכשיו אני מאשר שהפעולה שנותרה הושלמה','remaining','asserted','complete'),
 ('ניחשתי קודם; אחרי בדיקה אני מדווח שהמשימה שסומנה כמושלמת לא נעשתה','marked','asserted','incomplete'),
 ('אה, הפעולה שנותרה בוצעה רק עד האמצע, בזה אני בטוח','remaining','asserted','partial'),
 ('בדקתי: המשימה שסומנה כמושלמת הושלמה רק בחלקה','marked','asserted','partial'),
 ('עשיתי חצי ממה שנותר לביצוע, זאת לא השערה','remaining','asserted','partial'),
 ('יש לי דיווח מדויק: מה שסומן כמושלם נעשה רק חלקית','marked','asserted','partial'),
 ('אני משער שהפעולה שנותרה נעשתה רק חלקית, לא וידאתי','remaining','uncertain','partial'),
 ('אולי מה שסומן כמושלם נעשה עד האמצע, איני יודע','marked','uncertain','partial')]


def build():
 splits={s:[] for s in OPERATORS}
 for split,families in OPERATORS.items():
  for family,positive,negative,denied in families:
   for pair,subjects in enumerate(SUBJECTS):
    for ref,subject in zip(('remaining','marked'),subjects):
     for predicate in PREDICATES[split]:
      for status,word in zip(('complete','incomplete','partial'),ROOTS[predicate]):
       core=subject+' '+word
       for operator,commit in ((positive,'asserted'),(negative,denied)):
        semantics=[ref,commit,'unspecified' if commit=='nonassertion' else status]
        splits[split].append({'id':f'stance-{split}-{len(splits[split])}','text':operator.format(c=core),'allow':int(commit=='asserted'),'label':JOINT.index(tuple(semantics)),'semantics':semantics,'operator_family':family,'subject_pair':pair,'predicate_family':predicate,'source':'new_authored_contrast'})
 # Train-only anchors preserve old generic behavior. Previously inferred V7
 # test is now deliberately consumed training replay and cannot prove quality.
 old=json.loads(OLD.read_text());rng=random.Random(20261112);replay=[]
 for label in range(14):replay+=rng.sample([r for r in old['splits']['train'] if r['label']==label],20)
 consumed=json.loads((ROOT/'verification/facts-v7-replay-data-20261112.json').read_text())['splits']['test']
 for source,rows in (('old_v9_train_anchor',replay),('consumed_v7_test_replay',consumed)):
  for r in rows:
   if r['label']==14:continue
   sem=JOINT[r['label']];splits['train'].append({'id':f'stance-replay-{len(splits["train"])}','text':r['text'],'allow':int(sem[1]=='asserted'),'label':r['label'],'semantics':sem,'operator_family':source,'source':source})
 # Deduplicate only TRAIN, never alter held content based on model performance.
 seen={};train=[]
 for r in splits['train']:
  if r['text'] in seen:
   if seen[r['text']]!=r['allow']:raise ValueError('Conflicting commitment labels')
   continue
  train.append(r);seen[r['text']]=r['allow']
 splits['train']=train
 splits['natural_test']=[{'id':f'natural-{i}','text':t,'allow':int(c=='asserted'),'semantics':[r,c,s],'label':JOINT.index((r,c,s)),'operator_family':'authored_natural_challenge','source':'new_authored_naturalistic'} for i,(t,r,c,s) in enumerate(NATURAL)]
 groups={};texts={}
 for split,rows in splits.items():
  for r in rows:
   if r['text'] in texts:raise ValueError('Duplicate across/in held splits: '+r['text'])
   texts[r['text']]=split
   if split in OPERATORS:
    prior=groups.setdefault(r['operator_family'],split)
    if prior!=split:raise ValueError('Operator family leakage')
 prior_texts={r['text'] for s in old['splits'].values() for r in s}
 prior_texts|={r['text'] for s in json.loads((ROOT/'verification/scope-v11-replay-data-20261112.json').read_text())['splits'].values() for r in s}
 for split in ('test','natural_test'):
  duplicates=[r['text'] for r in splits[split] if r['text'] in prior_texts]
  if duplicates:raise ValueError('New held text already in previous material: '+str(duplicates))
 return {'schema':'scope-v13-stance-veto','synthetic':True,'human_reviewed':False,'recorded_speech':False,'scope':'Commitment to one generic recipe-state claim; no multi-fact named-action veto or speech/device validation. Label1 means asserted, including definite partial reports; not permission to mark complete.','consumed_v7_reference_rows_in_train':sum(r['source']=='consumed_v7_test_replay' for r in train),'fresh_tests_do_not_reuse_old_full_texts':True,'split_policy':'Operator families disjoint; controlled core references shared, predicate subsets disjoint for new examples. Same predicate words may occur in old replay/frozen encoder. Natural challenge authored separately, not natural user data.','splits':splits}


if __name__=='__main__':
 d=build();DATA.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'sha256':digest(DATA.read_bytes()),'splits':{s:{'rows':len(r),'labels':dict(Counter(x['allow'] for x in r))} for s,r in d['splits'].items()},'consumed_v7_replay':d['consumed_v7_reference_rows_in_train']},ensure_ascii=False))
