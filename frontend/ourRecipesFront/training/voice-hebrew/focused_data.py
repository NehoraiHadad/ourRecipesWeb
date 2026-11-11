"""Training-only ellipsis/state contrasts, with frozen synthetic holdouts.

Presence elsewhere is ambiguous: it does not prove that no portion was added.
Report + question uses the existing report-priority classification contract.
"""
import json
from pathlib import Path
import tempfile
from corpus import ROOT,digest,load_data,validate
from combined_data import build as prior_build,row,holdouts as broad_holdouts
from semantic_data import write,audit_queries

SPECS={
 'train':[
  ('קמח','מים','שמן','בלילה'),('סוכר','קקאו','חלב','תערובת'),
  ('מלח','פלפל','מיץ לימון','רוטב'),('חרדל','שמן זית','חומץ','רוטב'),
  ('טחינה','מים','מלח','ממרח'),('יוגורט','דבש','קינמון','תערובת'),
  ('רסק עגבניות','מים','פפריקה','רוטב'),('קמח תירס','חלב','סוכר','בלילה'),
  ('כמון','כורכום','שמן','תערובת'),('אורז','מים','מלח','תבשיל'),
  ('עדשים','מים','כמון','מרק'),('שום','מיץ לימון','מלח','רוטב'),
  ('גבינה','שמנת','מלח','ממרח'),('קפה','חלב','סוכר','משקה'),
  ('סילאן','שמן','חרדל','רוטב'),('שיבולת שועל','חלב','קינמון','דייסה')],
 'validation':[
  ('אבקת אפייה','מיץ תפוזים','וניל','בלילה'),('רוטב סויה','גינגר','שמן שומשום','רוטב'),
  ('בורגול','מיץ לימון','נענע','סלט'),('קוסקוס','מים חמים','פלפל שחור','תערובת'),
  ('שוקולד','חלב קוקוס','תמצית וניל','קרם'),('בזיליקום','שמן זית','צנוברים','ממרח')],
 'test':[
  ('קמח אורז','חלב שקדים','שומשום','בלילה'),('חמאת בוטנים','רוטב צילי','מיץ ליים','רוטב'),
  ('קינואה','חמוציות','פטרוזיליה','סלט'),('גריסים','ציר ירקות','פפריקה מתוקה','תבשיל'),
  ('מחית תמרים','אגוז מוסקט','שקדים','מילוי'),('פסטו','שמנת צמחית','אורגנו','רוטב')]}


DEFINITE={'מיץ לימון':'מיץ הלימון','שמן זית':'שמן הזית','רסק עגבניות':'רסק העגבניות',
 'קמח תירס':'קמח התירס','שיבולת שועל':'שיבולת השועל','אבקת אפייה':'אבקת האפייה',
 'מיץ תפוזים':'מיץ התפוזים','רוטב סויה':'רוטב הסויה','שמן שומשום':'שמן השומשום',
 'מים חמים':'המים החמים','פלפל שחור':'הפלפל השחור','חלב קוקוס':'חלב הקוקוס',
 'תמצית וניל':'תמצית הווניל','קמח אורז':'קמח האורז','חלב שקדים':'חלב השקדים',
 'חמאת בוטנים':'חמאת הבוטנים','רוטב צילי':'רוטב הצילי','מיץ ליים':'מיץ הליים',
 'ציר ירקות':'ציר הירקות','פפריקה מתוקה':'הפפריקה המתוקה','מחית תמרים':'מחית התמרים',
 'אגוז מוסקט':'אגוז המוסקט','שמנת צמחית':'השמנת הצמחית'}


def definite(obj):return DEFINITE.get(obj,'ה'+obj)


def authored():
    recs={};rows=[]
    for split,specs in SPECS.items():
        for i,(a,b,c,mix) in enumerate(specs):
            rid=f'focused-{split}-{i}'
            acts=[{'id':f'a{j}','step':j//2,'text':f'להוסיף {x} לקערה','report':f'הוספתי {x} לקערה'} for j,x in enumerate((a,b,c))]
            acts.append({'id':'a3','step':1,'text':'לערבב את ה'+mix,'report':'ערבבתי את ה'+mix})
            rec={'id':rid,'split':split,'title':mix+' עם '+a+' ו'+b,'ingredients':[a,b,c,mix],'actions':acts};recs[rid]=rec
            def add(name,text,effects=(),intent='report',**kw):
                r=row(rec,name,text,[(acts[j],v,e) for j,v,e in effects],intent,**kw)
                r['family']=split+':focused:'+name;rows.append(r)
            if split=='train':
                prefix='';verb='שמתי';join=' וגם ';tail='מה עכשיו?'
                states=['{dobj} כבר בקערה','את {dobj} כבר הכנסתי לקערה','{dobj} כבר בפנים, בתוך הקערה']
                neg='עדיין לא הכנסתי {obj} לקערה'
                correction='תיקון לדיווח שלי: '
            elif split=='validation':
                prefix='עדכון קטן: ';verb='הכנסתי';join=' יחד עם ';tail='איך ממשיכים מכאן?'
                states=['כעת יש {obj} בתוך הקערה','בקערה יש כבר {obj}']
                neg='את {dobj} עוד לא שמתי בקערה'
                correction='אני חוזר בי מהעדכון: '
            else:
                prefix='אז ככה, ';verb='הוספתי';join=' וגם את ';tail='מה נשאר לי לעשות?'
                states=['{dobj} כבר בתוך הקערה אצלי','הוספת {dobj} לקערה הושלמה']
                neg='טרם הכנסתי את {dobj} לקערה'
                correction='רגע, טעיתי קודם: '
            for j,obj in enumerate((a,b,c)):
                dobj=definite(obj)
                direct=f'{verb} {obj}'
                add(f'direct-{j}',prefix+direct,[(j,True,direct)])
                add(f'report-question-{j}',prefix+direct+', '+tail,[(j,True,direct)])
                for k,form in enumerate(states):
                    quote=form.format(obj=obj,dobj=definite(obj));add(f'implicit-{j}-{k}',quote,[(j,True,quote)])
                quote=neg.format(obj=obj,dobj=definite(obj))
                add(f'negative-{j}',quote,[(j,False,quote)])
                add(f'correction-{j}',correction+quote,[(j,False,quote)],completed=[acts[j]['id']],previous={'recipe_id':rid,'utterance':direct})
                # Mere presence outside does not prove that none was added.
                negatives=(
                 ('elsewhere',f'יש {obj} על השיש'),
                 ('uncertain',f'אני לא בטוח אם {dobj} כבר בקערה'),
                 ('partial-amount',f'{verb} רק חלק מכמות {dobj}'),
                 ('question',f'הגיע הזמן להוסיף {obj} לקערה?'),
                 ('meta',f'לא אמרתי ש{verb} {obj}'),
                 ('future',f'אני מתכנן להכניס {obj} לקערה בהמשך'),
                 ('wrong-operation',f'מדדתי את {dobj}'))
                nonreport_prefix={'train':'','validation':'אצלי כרגע, ','test':'לפי מה שאני יודע, '}[split]
                for name,text in negatives:add(f'{name}-{j}',nonreport_prefix+text,intent='clarify')
            # Both candidates share a verb. Evidence for the elided candidate
            # contains the shared predicate, not a single ingredient noun.
            clause=f'{verb} {a}{join}{definite(b) if split=="test" else b}'
            first=f'{verb} {a}';negative_mix='עוד לא ערבבתי את ה'+mix
            add('shared-verb',prefix+clause,[(0,True,first),(1,True,clause)])
            add('shared-verb-partial-step',prefix+clause+', אבל '+negative_mix,[(0,True,first),(1,True,clause),(3,False,negative_mix)])
            add('shared-verb-question',prefix+clause+'; '+tail,[(0,True,first),(1,True,clause)])
            # Reverse ingredient order; source-action position is not a label.
            reverse=f'{verb} {c}{join}{definite(a) if split=="test" else a}'
            add('shared-verb-reverse',reverse,[(2,True,f'{verb} {c}'),(0,True,reverse)])
            pos=definite(a)+' כבר בקערה';negative=neg.format(obj=b,dobj=definite(b))
            add('mixed-polarity',pos+'; '+negative,[(0,True,pos),(1,False,negative)])
            uncertain='אני לא יודע אם '+definite(a)+' כבר בקערה'
            confirmed=f'{verb} {b}'
            add('uncertain-plus-confirmed',uncertain+', אבל '+confirmed,[(1,True,confirmed)])
            add('confirmed-plus-next',confirmed+', ועכשיו '+tail,[(1,True,confirmed)])
            same={'train':'את המרכיב הזה שמתי בקערה','validation':'את אותו מרכיב הכנסתי לקערה כעת','test':'גם המרכיב שעליו דיברנו כבר נמצא בקערה'}[split]
            add('local-history',same,[(0,True,same)],previous={'recipe_id':rid,'utterance':first})
            add('foreign-history',same,intent='clarify',previous={'recipe_id':'a-different-recipe','utterance':first})
            for name,text,intent in [
              ('next',{'train':'מה הפעולה הבאה מתוך המתכון?','validation':'אחרי כל זה, כיצד עליי להתקדם?','test':'מה עליי לבצע בהמשך ההכנה לפי ההוראות?'}[split],'next'),
              ('missed',{'train':'על איזה שלב פסחתי?','validation':'האם נשארה לי פעולה פתוחה מלפני השלב הזה?','test':'איזו משימה מוקדמת נשארה אצלי ללא השלמה?'}[split],'missed'),
              ('advice',{'train':'יש לך עצה מעבר להוראות?','validation':'איזה שינוי היית מציע שאינו רשום כאן?','test':'אשמח לתוספת משלך שאינה חלק מההוראות'}[split],'advice')]:
                add(name,text,intent=intent,current=1 if intent=='missed' else 0)
    validate(list(recs.values()),rows);return recs,rows


def build(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    with tempfile.TemporaryDirectory() as tmp:
        _,p,_=prior_build(Path(tmp)/'prior');recs,rows=load_data(p)
    recs={k:v for k,v in recs.items() if v['split']=='train'};rows=[r for r in rows if r['split']=='train']
    nr,nx=authored();train=[r for r in nx if r['split']=='train'];held=[r for r in nx if r['split']!='train']
    hr={k:v for k,v in nr.items() if v['split']!='train'}
    # Broad-action guardrail is historical validation, not a new test.
    br,bx=broad_holdouts();br={k:v for k,v in br.items() if v['split']=='validation'}
    bx=[r for r in bx if r['split']=='validation'];common={**recs,**hr,**br}
    control=write(output/'control',common,rows+held+bx,'V8 training; fresh focused holdouts and historical broad validation guardrail')
    candidate=write(output/'combined',{**common,**{k:v for k,v in nr.items() if v['split']=='train'}},rows+train+held+bx,'V8 plus train-only state/ellipsis contrasts; identical holdouts')
    for name in ['validation.jsonl','test.jsonl']:
        if (control/name).read_bytes()!=(candidate/name).read_bytes():raise ValueError('Unmatched holdouts')
    allr,allx=load_data(candidate)
    audit={'study':'focused-v9','new_counts':validate(list(nr.values()),nx),'added_training_rows':len(train),
      'unique_new_training_utterances':len({r['utterance'] for r in train}),
      'query_conflicts':audit_queries(allr,allx),'source_sha256':digest((ROOT/'focused_data.py').read_bytes()),
      'scope':'Authored synthetic data; held-out recipes and split-specific state/ellipsis forms, shared ingredients/phenomena. Not human-reviewed or independently collected speech.',
      'historical_validation_guardrail':len(bx),'original_test_scored':False}
    (output/'data-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
    return control,candidate,audit
