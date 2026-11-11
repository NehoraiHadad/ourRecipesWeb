"""Model-only conversational expansion and a new pre-training holdout.

Original synthetic fixtures, not natural conversations or user recordings.
Recipes are split; common ingredients/verbs and linguistic phenomena overlap.
"""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
from corpus import ROOT,digest,load_data,validate
from semantic_data import build as previous_data,write,audit_queries

NOMINAL={'לשטוף':'שטיפת','לחתוך':'חיתוך','לקלף':'קילוף','לפרוס':'פריסת',
 'להוסיף':'הוספת','לערבב':'ערבוב','לבשל':'בישול','לטגן':'טיגון','לקצוץ':'קיצוץ',
 'לשמן':'שימון','לשים':'הנחת','למזוג':'מזיגת','לסנן':'סינון','לגרר':'גירור',
 'להרתיח':'הרתחת','לחמם':'חימום','לאפות':'אפיית','לטרוף':'טריפת','לשבור':'שבירת'}

SPECS={
 'validation':[
 ('משקה לימון לבדיקה','לימון|מים|משקה', [('לסחוט לימון','סחטתי לימון'),('להוסיף מים','הוספתי מים'),('לערבב את המשקה','ערבבתי את המשקה'),('למזוג משקה לכוס','מזגתי משקה לכוס')],None),
 ('ממרח שמיר לבדיקה','שמיר|גבינה|ממרח',[('לקצוץ שמיר','קצצתי שמיר'),('להוסיף גבינה','הוספתי גבינה'),('לערבב את הממרח','ערבבתי את הממרח'),('לפזר שמיר','פיזרתי שמיר')],None),
 ('פירות לבדיקה','תפוח|ענבים|סלט פירות',[('לקלף תפוח','קילפתי תפוח'),('לחתוך תפוח','חתכתי תפוח'),('לשטוף ענבים','שטפתי ענבים'),('לערבב סלט פירות','ערבבתי סלט פירות')],(0,1,'אותו')),
 ('כוסמת לבדיקה','מים|כוסמת',[('להרתיח מים','הרתחתי מים'),('לשטוף כוסמת','שטפתי כוסמת'),('להוסיף כוסמת לסיר','הוספתי כוסמת לסיר'),('לבשל כוסמת','בישלתי כוסמת')],None),
 ('בלילה לבדיקה','קמח|מים|שמן|בלילה',[('לשים קמח בקערה','שמתי קמח בקערה'),('להוסיף מים לקערה','הוספתי מים לקערה'),('להוסיף שמן לקערה','הוספתי שמן לקערה'),('לערבב בלילה','ערבבתי בלילה')],None),
 ('ברוקולי לבדיקה','ברוקולי|שמן',[('לשטוף ברוקולי','שטפתי ברוקולי'),('לחתוך ברוקולי','חתכתי ברוקולי'),('לשמן ברוקולי','שימנתי ברוקולי'),('לאפות ברוקולי','אפיתי ברוקולי')],(0,1,'אותו'))],
 'test':[
 ('סולת לבדיקה','סולת|מים|דייסה',[('לשים סולת בקערה','שמתי סולת בקערה'),('להוסיף מים','הוספתי מים'),('לערבב דייסה','ערבבתי דייסה'),('לבשל דייסה','בישלתי דייסה')],None),
 ('חציל לבדיקה','חציל|שמן',[('לשטוף חציל','שטפתי חציל'),('לפרוס חציל','פרסתי חציל'),('לשמן חציל','שימנתי חציל'),('לאפות חציל','אפיתי חציל')],(0,1,'אותו')),
 ('פירות אחרים לבדיקה','מנגו|קיווי|סלט פירות',[('לקלף מנגו','קילפתי מנגו'),('לחתוך מנגו','חתכתי מנגו'),('לחתוך קיווי','חתכתי קיווי'),('לערבב את סלט הפירות','ערבבתי את סלט הפירות')],(0,1,'אותו')),
 ('ביצים וקמח לבדיקה','ביצים|קמח|בלילה',[('לשבור ביצים','שברתי ביצים'),('לטרוף ביצים','טרפתי ביצים'),('להוסיף קמח','הוספתי קמח'),('לערבב את הבלילה','ערבבתי את הבלילה')],None),
 ('אורז שחור לבדיקה','אורז שחור|עשבי תיבול',[('לשטוף אורז שחור','שטפתי אורז שחור'),('לבשל אורז שחור','בישלתי אורז שחור'),('לסנן אורז שחור','סיננתי אורז שחור'),('לערבב אורז עם עשבי תיבול','ערבבתי אורז עם עשבי תיבול')],(0,1,'אותו')),
 ('סלט נוסף לבדיקה','צנון|פלפל צהוב|מיץ לימון|סלט',[('לגרר צנון','גיררתי צנון'),('לחתוך פלפל צהוב','חתכתי פלפל צהוב'),('להוסיף מיץ לימון','הוספתי מיץ לימון'),('לערבב את הסלט','ערבבתי את הסלט')],None)]}


def nominal(action):
    first,rest=action['text'].split(' ',1)
    if first not in NOMINAL:return None
    return NOMINAL[first]+' '+rest.removeprefix('את ')


def row(recipe,name,text,effects=(),intent='report',previous=None,completed=(),current=0):
    return {'id':recipe['id']+'-'+name,'recipe_id':recipe['id'],'split':recipe['split'],
      'scenario':name,'family':recipe['split']+':combined:'+name,'utterance':text,'previous':previous,
      'state':{'currentStep':current,'completed':list(completed),'remaining':[a['id'] for a in recipe['actions'] if a['id'] not in completed]},
      'gold':{'intent':intent,'changes':[{'actionId':a['id'],'done':v,'evidence':e} for a,v,e in effects]},
      'provenance':'synthetic_authored','human_review':'pending'}


def holdouts():
    recs={};rows=[]
    for split,specs in SPECS.items():
        for n,(title,ingredients,actions,reference) in enumerate(specs):
            rid=f'combined-{split}-{n}';acts=[{'id':f'a{i}','step':i//2,'text':a,'report':b} for i,(a,b) in enumerate(actions)]
            recipe={'id':rid,'split':split,'title':title,'ingredients':ingredients.split('|'),'actions':acts};recs[rid]=recipe
            def add(name,text,effects=(),intent='report',**kwargs):rows.append(row(recipe,name,text,effects,intent,**kwargs))
            for j,a in enumerate(acts):
                r=a['report'];nom=nominal(a)
                if split=='validation':
                    text='העדכון שלי כרגע: '+r;neg='לא '+r
                    completion='סיימתי את '+nom if nom else 'אפשר לסמן שבוצע: '+r
                    question='האם כבר צריך '+a['text']+'?'
                else:
                    text='לגבי מה שכבר עשיתי, '+r;neg='עוד לא '+r
                    completion='כבר גמרתי את '+nom if nom else 'בוצע אצלי הדבר הבא: '+r
                    question='אתה מציע לי '+a['text']+' עכשיו?'
                add('assertion-'+str(j),text,[(a,True,r)])
                add('completion-'+str(j),completion,[(a,True,completion)])
                prefix='בבדיקה נוספת התברר: ' if split=='validation' else 'הדיווח שלי מתוקן — '
                add('negative-'+str(j),prefix+neg,[(a,False,neg)],completed=[a['id']])
                add('question-'+str(j),question,intent='clarify')
            a,b,c,d=acts
            conjunction='; בהמשך ' if split=='validation' else ', ולאחר מכן '
            add('two-reports',a['report']+conjunction+b['report'],[(a,True,a['report']),(b,True,b['report'])])
            neg='עדיין לא '+b['report']
            add('partial-step',a['report']+'; '+neg,[(a,True,a['report']),(b,False,neg)])
            neg='לא '+a['report']
            text=('אני משנה את מה שאמרתי: ' if split=='validation' else 'הייתה טעות בדיווח שלי: ')+neg
            add('correction',text,[(a,False,neg)],previous={'recipe_id':rid,'utterance':a['report']},completed=[a['id']])
            if reference:
                x,y,p=reference;verb=acts[y]['report'].split(' ',1)[0]
                tail=verb+' '+p
                text=('השלב הזה הושלם: ' if split=='validation' else 'ועכשיו אפשר לומר ש')+tail
                # Include the prefix in gold if it attaches to the first word.
                quote=text if split=='test' else tail
                add('local-reference',text,[(acts[y],True,quote)],previous={'recipe_id':rid,'utterance':acts[x]['report']})
                add('foreign-reference',text,intent='clarify',previous={'recipe_id':'other-recipe','utterance':acts[x]['report']})
            fixed={
             'validation':[('next','מה יהיה המשך ההכנה מכאן?','next'),('missed','תבדוק מה לא השלמתי בדרך לכאן','missed'),('advice','יש הצעה שלך שאינה חלק מהמתכון?','advice'),('uncertain','אני מתלבט אם בכלל ביצעתי את הפעולה','clarify'),('partial-action','הפעולה באמצע, עוד נותר ממנה חלק','clarify'),('ambiguous','העניין ההוא סודר מבחינתי','clarify'),('meta','דיברתי על ביצוע, לא אישרתי שבוצע','clarify'),('future','זה בתכנון שלי להמשך, עוד לא דיווחתי על ביצוע','clarify')],
             'test':[('next','אחרי מה שסימנתי, איזו פעולה עוד מחכה לי?','next'),('missed','אילו דברים השארתי פתוחים בשלבים הקודמים?','missed'),('advice','אשמח לרעיון נוסף מעבר למה שכתוב כאן','advice'),('uncertain','יכול להיות שעשיתי, אני לא מסוגל לאשר','clarify'),('partial-action','יש התקדמות בחלק מהפעולה, עדיין לא כולה','clarify'),('ambiguous','עם הדבר הזה גמרתי כבר','clarify'),('meta','לא טענתי שסיימתי את הביצוע','clarify'),('future','אני עומד להתחיל בהמשך, זה עוד בתוכנית','clarify')]}[split]
            for name,text,intent in fixed:add(name,text,intent=intent,current=1 if intent=='missed' else 0)
    validate(list(recs.values()),rows);return recs,rows


def expansion(recs):
    rows=[]
    for recipe in recs.values():
        if recipe['split']!='train':continue
        paraphrases={
          'next':['מה אפשר לבצע עכשיו מתוך ההוראות?','איזו פעולה מגיעה אחרי מה שכבר עשיתי?','אני צריך הנחיה להמשך המתכון','עם איזה חלק של המתכון ממשיכים?'],
          'missed':['יש פעולה שהשארתי לא גמורה מאחור?','מה היה צריך לקרות לפני השלב הזה ולא קרה?','עזור לי לאתר שלב שפסחתי עליו','תראה לי אילו פעולות מוקדמות נותרו פתוחות'],
          'advice':['אני מבקש רעיון שלא מופיע במתכון','אפשר להציע שינוי בהוראות המקור?','מה תוסיף מעבר להנחיות הכתובות?','יש לך עצה משלך להכנה הזאת?'],
          'clarify':['התחלתי רק חלק ולא השלמתי','אולי עשיתי משהו, לא אוכל לומר בביטחון','זו שאלה על ביצוע, לא אישור ביצוע','אני מתכוון לעשות בהמשך, עוד לא עשיתי']}
        for intent,phrases in paraphrases.items():
            for k,text in enumerate(phrases):rows.append(row(recipe,f'bridge-intent-{intent}-{k}',text,intent=intent,current=1 if intent=='missed' else 0))
        for j,a in enumerate(recipe['actions']):
            r=a['report']
            for k,prefix in enumerate(['אני מעדכן מה עשיתי: ','דיווח מהמטבח — ','מבחינת ההתקדמות שלי, ','כרגע אפשר לסמן: ']):
                rows.append(row(recipe,f'bridge-positive-{j}-{k}',prefix+r,[(a,True,r)]))
            for k,prefix in enumerate(['כדי לדייק: ','חשוב לי לתקן, ']):
                neg='לא '+r;rows.append(row(recipe,f'bridge-negative-{j}-{k}',prefix+neg,[(a,False,neg)]))
            for k,text in enumerate(['אני שוקל '+a['text']+' בהמשך','מה דעתך, האם צריך '+a['text']+'?']):
                rows.append(row(recipe,f'bridge-nonreport-{j}-{k}',text,intent='clarify'))
            nom=nominal(a)
            if nom:
                for k,text in enumerate(['סיימתי לבצע את '+nom,'השלמתי עכשיו את '+nom]):
                    rows.append(row(recipe,f'bridge-nominal-{j}-{k}',text,[(a,True,text)]))
            if r.startswith('הוספתי '):
                for k,verb in enumerate(['שמתי ','הכנסתי ']):
                    quote=verb+r.removeprefix('הוספתי ')
                    rows.append(row(recipe,f'bridge-alias-{j}-{k}',quote,[(a,True,quote)]))
    return rows


def build(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    with tempfile.TemporaryDirectory() as tmp:
        c,r,_=previous_data(Path(tmp)/'old',aligned_gold=True)
        cr,control=load_data(c);rr,richer=load_data(r)
    cr={k:v for k,v in cr.items() if v['split']=='train'};rr={k:v for k,v in rr.items() if v['split']=='train'}
    control=[v for v in control if v['split']=='train'];richer=[v for v in richer if v['split']=='train']
    extra=expansion(rr);hr,held=holdouts()
    c=write(output/'control',{**cr,**hr},control+held,'Combined study control: historical training and fresh broad-action holdouts')
    r=write(output/'combined',{**rr,**hr},richer+extra+held,'Combined study: semantic training plus conversational bridges; fresh holdouts')
    for name in ['validation.jsonl','test.jsonl']:
        if (c/name).read_bytes()!=(r/name).read_bytes():raise ValueError('Holdout comparison mismatch')
    audit={'new_holdout_counts':validate(list(hr.values()),held),'bridge_rows':len(extra),
        'bridge_unique_utterances':len({v['utterance'] for v in extra}),
        'human_reviewed':False,'prior_test_role':'Regression only, not checkpoint selection or this new test',
        'scope':'Authored synthetic scenarios; six recipes per split, shared ingredients/verbs and language phenomena; not natural or independently collected speech',
        'query_conflicts':audit_queries({**rr,**hr},richer+extra+held),
        'source_sha256':digest((ROOT/'combined_data.py').read_bytes())}
    (output/'data-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n');return c,r,audit


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('output');a=p.parse_args();_,_,proof=build(a.output);print(json.dumps(proof,ensure_ascii=False,indent=2))
