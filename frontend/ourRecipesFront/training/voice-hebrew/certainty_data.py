"""Prospective certainty study: group roots stay in one split; authored, not speech."""
from copy import deepcopy
from collections import Counter
import json
from corpus import ROOT,digest,load_data,validate
from reference_data import training,normalize

LABELS=('remaining_done','remaining_not_done','completed_not_done','clarify','other')
# Root IDs, not prefixes or state combinations, define split membership.
BODIES={
 'train':{
  'remaining_done':[
   'הפעולה הבודדת שעדיין נותרה בשלב הנוכחי בוצעה',
   'המשימה האחת שעוד חסרה בחלק הזה הושלמה',
   'הדבר היחיד שטרם היה גמור בשלב שלי כבר גמור',
   'הפעולה האחרונה הפתוחה בחלק הנוכחי נעשתה',
   'המשימה היחידה שעד עכשיו לא הושלמה בשלב הנוכחי הושלמה כעת',
   'הפעולה היחידה שעד לפני רגע לא נעשתה בשלב הזה כבר נעשתה',
   'מה שעוד נשאר יחיד לביצוע בשלב הנוכחי הסתיים',
   'הדבר האחד שחיכה להשלמה בחלק הנוכחי הושלם'],
  'remaining_not_done':[
   'הפעולה הבודדת שנותרה בשלב הנוכחי עוד לא בוצעה',
   'המשימה האחת שחסרה בחלק הזה טרם הושלמה',
   'הדבר היחיד שטרם היה גמור בשלב שלי אינו גמור גם עכשיו',
   'הפעולה האחרונה הפתוחה בחלק הנוכחי עדיין לא נעשתה',
   'המשימה היחידה שעוד לא הושלמה בשלב הנוכחי נשארה לא מושלמת',
   'הפעולה היחידה שלא נעשתה עד כה בשלב הזה עדיין לא נעשתה',
   'מה שנשאר יחיד לביצוע בשלב הנוכחי טרם הסתיים',
   'הדבר האחד שחיכה להשלמה בחלק הנוכחי לא הושלם'],
  'completed_not_done':[
   'הפעולה היחידה שרשומה כגמורה בשלב הנוכחי בעצם לא בוצעה',
   'המשימה האחת שסימנתי כמושלמת בחלק הזה עדיין פתוחה',
   'הדבר היחיד שמופיע כגמור בשלב שלי למעשה לא גמור',
   'הפעולה היחידה שאושרה כבוצעה בחלק הנוכחי טרם נעשתה',
   'המשימה היחידה שהרישום מראה כהושלמה בשלב הנוכחי לא הושלמה',
   'הפעולה האחת שסומנה כנעשתה בשלב הזה לא נעשתה באמת',
   'מה שרשום יחיד כמבוצע בשלב הנוכחי למעשה לא הסתיים',
   'הדבר היחיד שנחשב מושלם בחלק הנוכחי עדיין אינו מושלם']},
 'validation':{
  'remaining_done':[
   'המשימה הבודדת שהמתינה לביצוע בשלב שבו אני נמצא כבר הושלמה',
   'הפעולה היחידה שעד כה לא היתה מוכנה בחלק הנוכחי מוכנה עכשיו',
   'מה שהיה חסר בתור פעולה יחידה בשלב הנוכחי כבר נעשה',
   'הדבר האחרון שנותר פתוח בשלב הנוכחי הושלם לפני רגע'],
  'remaining_not_done':[
   'המשימה הבודדת שהמתינה לביצוע בשלב שבו אני נמצא עוד לא הושלמה',
   'הפעולה היחידה שעד כה לא היתה מוכנה בחלק הנוכחי עוד איננה מוכנה',
   'מה שהיה חסר בתור פעולה יחידה בשלב הנוכחי עדיין לא נעשה',
   'הדבר האחרון שנותר פתוח בשלב הנוכחי לא הושלם עד עכשיו'],
  'completed_not_done':[
   'המשימה הבודדת שמופיעה אצלי כגמורה בשלב שבו אני נמצא לא הושלמה בפועל',
   'הפעולה היחידה עם אישור ביצוע בחלק הנוכחי איננה מוכנה',
   'מה שנחשב לפעולה המושלמת היחידה בשלב הנוכחי לא נעשה באמת',
   'הדבר היחיד שסומן גמור בשלב הנוכחי למעשה לא הושלם']},
 'test':{
  'remaining_done':[
   'הפעולה היחידה שחסרה עד לפני שנייה בשלב שאני בו הושלמה זה עתה',
   'המשימה האחרונה בלי סימון ביצוע בחלק הנוכחי כבר מאחוריי',
   'הדבר הבודד שהיה בשלב הנוכחי במצב לא גמור הושלם לגמרי',
   'מה שהיה בשלב הזה המשימה היחידה שטרם נעשתה כבר בוצע'],
  'remaining_not_done':[
   'הפעולה היחידה שחסרה עד לפני שנייה בשלב שאני בו טרם הושלמה',
   'המשימה האחרונה בלי סימון ביצוע בחלק הנוכחי עוד מחכה לביצוע',
   'הדבר הבודד שהיה בשלב הנוכחי במצב לא גמור נותר לא גמור',
   'מה שהיה בשלב הזה המשימה היחידה שטרם נעשתה עדיין לא בוצע'],
  'completed_not_done':[
   'הפעולה היחידה שמסומנת כבוצעה בשלב שאני בו לא בוצעה בסופו של דבר',
   'המשימה היחידה עם סימון סיום בחלק הנוכחי למעשה עוד מחכה לביצוע',
   'הדבר הבודד שרשום בשלב הנוכחי במצב גמור בעצם לא גמור',
   'מה שנרשם בשלב הזה כמשימה היחידה שנעשתה עדיין לא בוצע']}}

# Every wrapper denies certainty of the enclosed completion claim.
# Validation/test use new surface forms; semantic categories recur by design.
WRAPPERS={
 'train':[
  ('hedge','אולי ',''),
  ('hedge','אני משער ש',''),('hedge','נדמה לי ש',''),('hedge','יכול להיות ש',''),
  ('memory','אני לא זוכר אם ',' או שלא'),
  ('metaneg','לא דיווחתי ש',''),('metaneg','לא טענתי ש',''),('metaneg','אין לי אישור ש',''),
  ('question','האם ','?'),('hypothesis','אם ',' אז אפשר להתקדם?'),
  ('quote','הוא שאל אם ',' אבל לא אמרתי שזה קרה'),
  ('quote','זה ציטוט לדוגמה: "','", לא דיווח שלי'),
  ('partial','רק התחלתי לבדוק אם ','; אין עדיין דיווח סיום'),
  ('future','מחר אדווח אם ','; כרגע לא ידוע'),
  ('future','עוד מעט אבדוק אם ','; אין לי תשובה עכשיו'),
  ('partial','אני רק באמצע העבודה; עדיין אין אישור ש','')],
 'validation':[
  ('hedge','אני מנחש ש',''),('memory','אין לי זיכרון ברור אם ',''),
  ('metaneg','לא הודעתי ש',''),('question','תוכל לבדוק האם ','?'),
  ('hypothesis','בהנחה ש',' מה יהיה הצעד הבא?'),
  ('quote','חבר טען ש','; אני לא מאשר את הדברים'),
  ('partial','עוד לא סיימתי את העבודה, אז איני מאשר ש',''),
  ('future','בהמשך אבדוק האם ','; זאת תוכנית לעתיד')],
 'test':[
  ('hedge','למיטב הניחוש שלי ',''),('memory','אני מתקשה להיזכר אם ',''),
  ('metaneg','לא מסרתי עדכון שלפיו ',''),('question','רציתי לשאול האם ','?'),
  ('hypothesis','נניח לרגע ש','; האם זה מספיק?'),
  ('quote','שמעתי מישהו אומר ש','; איני מעיד על כך בעצמי'),
  ('partial','אני עוד עובד על זה ולא יכול לאשר ש',''),
  ('future','מאוחר יותר אברר אם ','; כרגע אין קביעה') ]}
ASSERT={'train':['','בדקתי שוב: ','אני מאשר ש'], 'validation':['','אני מעדכן: '], 'test':['','רק לעדכון: ']}

# Explicitly labelled reference ambiguities; general navigation remains legacy.
CLARIFY_BASE={
 'סיימתי את כל הפעולות שנותרו בשלב הזה','סיימתי רק חלק מהפעולה היחידה שנותרה בשלב הזה',
 'סיימתי את הפעולה היחידה שנותרה בשלב הקודם','סיימתי את הפעולה היחידה שנותרה במתכון האחר',
 'אולי סיימתי את הפעולה היחידה שנותרה בשלב הנוכחי','אני לא זוכר אם עשיתי את הפעולה היחידה שנותרה בשלב הזה',
 'האם סיימתי את הפעולה היחידה שנותרה בשלב הזה?',
 'אני מתכנן לעשות את הפעולה היחידה שנותרה בשלב הזה','אחר כך אסיים את המשימה היחידה שנותרה בשלב הנוכחי',
 'עוד מעט אבצע את הפעולה היחידה שנותרה בשלב הזה',
 'שאלתי אם הפעולה היחידה שנותרה בשלב הזה בוצעה','אמרתי שאולי אסיים את המשימה היחידה שנותרה בשלב הנוכחי',
 'לא אמרתי שסיימתי את הפעולה היחידה שנותרה בשלב הנוכחי','הפעולה היחידה שנותרה בשלב הבא כבר בוצעה',
 'עשיתי את הפעולה הראשונה שנותרה בשלב הזה','סיימתי אחת הפעולות שנותרו בשלב הנוכחי',
 'ביצעתי כמה מהמשימות שנותרו בשלב הזה','אני לא בטוח מה נעשה בשלב הנוכחי',
 'המשימה היחידה שסימנתי כגמורה בשלב הקודם לא נעשתה',
 'אולי טעיתי כשהפעולה היחידה שסימנתי כמושלמת בשלב הזה לא בוצעה',
 'אם אסיים את הפעולה שנותרה בשלב הנוכחי מה יהיה אחר כך?',
 'אני מתחיל את הפעולה היחידה שנותרה בשלב הנוכחי','אני באמצע המשימה היחידה שנותרה בשלב הזה',
 'רק שאלתי על הפעולה היחידה שנותרה, לא דיווחתי שביצעתי אותה'}


def language_rows():
    output={s:[] for s in BODIES}
    for split,modes in BODIES.items():
        for mode,texts in modes.items():
            for n,body in enumerate(texts):
                group=f'{split}:{mode}:{n}'
                for prefix in ASSERT[split]:output[split].append({'text':prefix+body,'label':mode,'group':group,'kind':'assertion'})
                for kind,prefix,suffix in WRAPPERS[split]:output[split].append({'text':prefix+body+suffix,'label':'clarify','group':group,'kind':kind})
    _,old=load_data(ROOT/'runs/state-v13-preflight/shared')
    forbidden=[r for r in old if r['split']!='train']
    for n,row in enumerate(training(forbidden)):
        text=row['text'];base=text.removeprefix('עדכון מהמטבח: ')
        label='clarify' if base in CLARIFY_BASE else row['label']
        output['train'].append({'text':text,'label':label,'group':f'train:legacy:{normalize(base)}','kind':'legacy'})
    seen={}
    for split,rows in output.items():
        unique={}
        for row in rows:
            key=normalize(row['text'])
            if key in seen and seen[key]!=split:raise ValueError('Cross-split text leakage')
            if key in unique and unique[key]['label']!=row['label']:raise ValueError('Contradictory labels')
            unique[key]=row;seen[key]=split
        output[split]=list(unique.values())
    return output


def contexts(split):
    recipes={}
    for key,objects in [('x',['שומר','צנון','חסה']),('y',['דלורית','דלעת','סלרי','אפונה'])]:
        actions=[{'id':f'c_{split}_{key}_{s}_{j}','step':s,'text':verb+' '+obj,'report':'דיווח '+obj} for s,verb in [(0,'לנקות'),(1,'לחתוך')] for j,obj in enumerate(objects)]
        rid=f'certainty-{split}-{key}'
        recipes[rid]={'id':rid,'split':split,'title':'בדיקת ודאות '+key,'ingredients':objects,'actions':actions}
    return recipes


def fixtures(split,language):
    recs=contexts(split);rx,ry=list(recs);rows=[]
    for n,item in enumerate(language):
        for k,(rid,current,shape) in enumerate([(rx,0,'unique'),(rx,0,'ambiguous'),(ry,1,'unique'),(ry,1,'zero')]):
            recipe=recs[rid];inside=[a['id'] for a in recipe['actions'] if a['step']==current];outside=[a['id'] for a in recipe['actions'] if a['step']!=current]
            count=1 if shape=='unique' else 2 if shape=='ambiguous' else 0
            selected=inside[-count:] if count else []
            completed=selected if item['label']=='completed_not_done' else [i for i in inside if i not in selected]
            completed=completed+[outside[0]]
            changes=[{'actionId':selected[0],'done':item['label']=='remaining_done','evidence':item['text']}] if shape=='unique' and item['label'] not in ('clarify','other') else []
            rows.append({'id':f'{split}-certainty-{n}-{k}','recipe_id':rid,'split':split,'utterance':item['text'],
                'previous':None,'state':{'currentStep':current,'completed':completed,'remaining':[a['id'] for a in recipe['actions'] if a['id'] not in completed]},
                'gold':{'intent':'report' if changes else 'clarify','changes':changes},'scenario':item['kind'],
                'evaluation_kind':'uncertain' if item['label']=='clarify' else 'reference',
                'counterfactual_group':f'{split}-certainty-{n}', 'family':item['group'],
                'provenance':'synthetic_authored','human_review':'pending'})
    validate(list(recs.values()),rows)
    return {'recipes':list(recs.values()),'rows':rows}


def freeze(output):
    from datetime import datetime,timezone
    from corpus import validate as _validate
    folder=ROOT/output;folder.mkdir(parents=True,exist_ok=False)
    data=language_rows()
    # All new roots are independent of old body training and consumed heldouts.
    _,old=load_data(ROOT/'runs/state-v13-preflight/shared')
    consumed=json.loads((ROOT/'verification/reference-scope-fixtures-20261112.json').read_text())['rows']
    oldtexts={normalize(r['utterance']) for r in old+consumed}
    assert not oldtexts & {normalize(r['text']) for s in ('validation','test') for r in data[s]}
    (folder/'language.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    for split in ('validation','test'):(folder/f'{split}.json').write_text(json.dumps(fixtures(split,data[split]),ensure_ascii=False,indent=2)+'\n')
    plan={'created_utc':datetime.now(timezone.utc).isoformat(),'study':'certainty-v5','labels':LABELS,
        'counts':{s:dict(Counter(r['label'] for r in rows)) for s,rows in data.items()},
        'distinct_root_groups':{s:len({r['group'] for r in rows}) for s,rows in data.items()},
        'files':{p.name:digest(p.read_bytes()) for p in folder.glob('*.json')},
        'source_sha256':digest((ROOT/'certainty_data.py').read_bytes()),
        'limitations':'Authored synthetic; correlated operator/body combinations; surface roots/wrappers separated, semantic categories shared; no human review or speech.',
        'new_test_inference':False,'consumed_tests_role':'736 and96 are post-selection regression only; original120 untouched'}
    (folder/'plan.json').write_text(json.dumps(plan,indent=2)+'\n');return plan


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');a=p.parse_args();print(json.dumps(freeze(a.output)))
