"""Fresh24 wordings/96 state cases after the consumed negation-scope failure."""
from copy import deepcopy
import datetime
import json
from pathlib import Path
from corpus import ROOT,digest,validate
from reference_data import normalize

TEXTS={
 'remaining_done':[
 'כבר גמרתי את המשימה היחידה שבחלק הנוכחי היתה עד עכשיו ללא ביצוע',
 'השלב הנוכחי התקדם: הפעולה היחידה שהיתה חסרה כבר נעשתה',
 'מה שעד לפני רגע לא היה גמור והיה יחיד בשלב הזה כבר הושלם',
 'הפעולה האחת שנותרה בשלב שאני מבצע כעת הגיעה לסיום',
 'לפני דקה סיימתי את הדבר היחיד שבשלב הנוכחי חיכה להשלמה',
 'המשימה האחרונה הפתוחה בחלק שבו אני נמצא נעשתה עכשיו'],
 'remaining_not_done':[
 'למרות ההתקדמות המשימה היחידה שטרם הושלמה בשלב הנוכחי לא נעשתה',
 'עוד לא גמרתי את הדבר היחיד שבחלק הזה נשאר לי פתוח',
 'הפעולה האחת שממתינה בשלב הנוכחי ממשיכה להמתין',
 'בשלב שאני מבצע כרגע נשארה משימה יחידה וגם עכשיו היא לא גמורה',
 'אין עדיין ביצוע של המשימה היחידה שנשארה בחלק הנוכחי',
 'לא הגעתי לסיום הפעולה היחידה שעוד פתוחה בשלב שלי'],
 'completed_not_done':[
 'אני מבטל את ההודעה הקודמת: המשימה היחידה שצוינה כמושלמת בשלב הזה טרם נעשתה',
 'יש טעות ברשימה: הפעולה היחידה שסומנה כבוצעה בחלק הנוכחי בעצם פתוחה',
 'השלב הנוכחי כולל סימון ביצוע יחיד והוא שגוי: אותה פעולה לא גמורה',
 'מה שרשום אצלי כגמור בחלק הזה והוא היחיד כזה לא בוצע',
 'צריך להסיר את אישור הביצוע מהפעולה היחידה שאושרה בשלב הנוכחי',
 'המשימה היחידה שהוכרזה כגמורה בחלק שאני בו אינה גמורה באמת'],
 'other':[
 'אני משער שהמשימה היחידה שנותרה בשלב הנוכחי בוצעה',
 'רק התחלתי לעשות את המשימה היחידה שנותרה בחלק הזה',
 'עוד מעט אגמור את הדבר היחיד שנותר בשלב הנוכחי',
 'לא דיווחתי שהפעולה היחידה שנותרה בשלב הנוכחי בוצעה',
 'סיימתי את הפעולה היחידה שנותרה בחלק הבא של המתכון',
 'כבר ביצעתי אחת מהמשימות שנותרו בחלק הזה']}


def build():
    recs={}
    for name,objects in [('a',['גזר','בצל','קישוא']),('b',['קולרבי','בטטה','פלפל','כרישה'])]:
        actions=[]
        for step,verb in [(0,'לשטוף'),(1,'לחתוך')]:
            actions += [{'id':f'opaque_{name}_{step}_{j}','step':step,'text':verb+' '+obj,'report':'דיווח '+obj} for j,obj in enumerate(objects)]
        recs[name]={'id':'scope-'+name,'split':'test','title':'בדיקת משמעות עם '+objects[0],'ingredients':objects,'actions':actions}
    rows=[]
    for mode,texts in TEXTS.items():
        for n,text in enumerate(texts):
            for case,(key,current,shape) in enumerate([('a',0,'unique'),('a',0,'ambiguous'),('b',1,'unique'),('b',1,'zero')]):
                recipe=recs[key];inside=[a['id'] for a in recipe['actions'] if a['step']==current];outside=[a['id'] for a in recipe['actions'] if a['step']!=current]
                k=1 if shape=='unique' else 2 if shape=='ambiguous' else 0;selected=inside[-k:] if k else []
                inside_done=selected if mode=='completed_not_done' else [v for v in inside if v not in selected]
                done=inside_done+[outside[0]];state={'currentStep':current,'completed':done,'remaining':[a['id'] for a in recipe['actions'] if a['id'] not in done]}
                changes=[{'actionId':selected[0],'done':mode=='remaining_done','evidence':text}] if shape=='unique' and mode!='other' else []
                rid=f'scope-{mode}-{n}-{case}';rows.append({'id':rid,'recipe_id':recipe['id'],'split':'test','scenario':mode,'family':'test:scope:'+mode,
                    'utterance':text,'previous':None,'state':state,'gold':{'intent':'report' if changes else 'clarify','changes':changes},
                    'evaluation_kind':'guardrail' if mode=='other' else 'state','counterfactual_group':None if mode=='other' else f'scope-{mode}-{n}',
                    'provenance':'synthetic_authored','human_review':'pending'})
    recipes={r['id']:r for r in recs.values()};validate(list(recipes.values()),rows);return recipes,rows


def freeze():
    recs,rows=build();folder=ROOT/'verification';p=folder/'reference-scope-fixtures-20261112.json';p.write_text(json.dumps({'recipes':list(recs.values()),'rows':rows},ensure_ascii=False,indent=2)+'\n')
    # Exact texts disjoint from the already-consumed V12/V14 heldouts.
    from state_data import FORMS
    old={normalize(t) for split in ('validation','test') for forms in FORMS[split].values() for t in forms}
    assert not old&{normalize(r['utterance']) for r in rows}
    proof={'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'role':'New96-case holdout authored after one consumed wording failed;24 distinct utterances, four contexts each; not natural speech',
        'fixtures_sha256':digest(p.read_bytes()),'source_sha256':digest((ROOT/'reference_scope.py').read_bytes()),'utterances':24,'examples':96,
        'recipe_shapes':'Two steps with3 or4 actions each; unique/ambiguous/zero target and partial completion outside current step',
        'new_model_test_inference':False,'human_reviewed':False}
    (folder/'reference-scope-plan-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');return proof


if __name__=='__main__':print(json.dumps(freeze()))
