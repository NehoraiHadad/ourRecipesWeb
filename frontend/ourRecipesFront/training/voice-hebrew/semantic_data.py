"""Authored Hebrew grammar fixtures and audit; no user data or model calls.

Split-specific surface forms and disjoint new recipe objects. This remains
synthetic: linguistic phenomena are shared and an author knows all templates.
"""
from collections import Counter, defaultdict
from copy import deepcopy
import json
from pathlib import Path
import shutil
import tempfile
from ablation import augmented_data
from corpus import ROOT, digest, load_data, queries, validate

VERBS=[('לשטוף','שטפתי','שטוף','שטופה','שטיפת'),
       ('לחתוך','חתכתי','חתוך','חתוכה','חיתוך'),
       ('לקלף','קילפתי','מקולף','מקולפת','קילוף'),
       ('לפרוס','פרסתי','פרוס','פרוסה','פריסת')]
PAIRS={'train':[('גזר','בטטה'),('בצל','עגבנייה'),('מלפפון','חסה'),('קישוא','בננה'),
                ('תפוח','בטטה'),('סלק','עגבנייה'),('אבוקדו','בננה'),('לימון','חסה')],
       'validation':[('צנון','כרישה'),('ארטישוק','גויאבה'),('פלפל','דלעת'),('אגס','צנונית')],
       'test':[('אפרסמון','לפת'),('משמש','דלורית'),('שזיף','פפאיה'),('אפרסק','נקטרינה')]}


def authored():
    recs={};rows=[]
    for split,pairs in PAIRS.items():
        for n,(male,female) in enumerate(pairs):
            for shape in (['same-verb','different-verb'] if split=='train' else ['same-verb' if n%2==0 else 'different-verb']):
                rid=f'semantic-{split}-{n}-{shape}'
                specs=[(0,male,0),(1,male,0),(0 if shape=='same-verb' else 2,female,1),(1 if shape=='same-verb' else 3,female,1)]
                acts=[]
                for j,(vi,obj,gender) in enumerate(specs):
                    inf,past,pm,pf,nominal=VERBS[vi]
                    acts.append({'id':f'a{j}','step':j//2,'text':inf+' '+obj,'report':past+' '+obj,
                        'verb':past,'inf':inf,'obj':obj,'definite':'ה'+obj,'pronoun':'אותה' if gender else 'אותו',
                        'passive':pf if gender else pm,'nominal':nominal,'gender':gender,
                        'subject':'היא' if gender else 'הוא','nominal_female':vi in (0,3)})
                rec={'id':rid,'split':split,'title':f'תרגיל לשוני {male} ו{female}',
                     'ingredients':[male,female],'actions':acts};recs[rid]=rec
                def add(name,text,effects=(),intent='report',completed=(),previous=None,current=0):
                    rows.append({'id':rid+'-'+name,'recipe_id':rid,'split':split,'scenario':name,
                        'family':split+':semantic:'+name,'utterance':text,'previous':previous,
                        'state':{'currentStep':current,'completed':list(completed),'remaining':[a['id'] for a in acts if a['id'] not in completed]},
                        'gold':{'intent':intent,'changes':[{'actionId':a['id'],'done':value,'evidence':quote} for a,value,quote in effects]},
                        'provenance':'synthetic_authored','human_review':'pending'})
                for j,a in enumerate(acts):
                    r=a['report'];d=a['definite'];v=a['verb'];inf=a['inf'];obj=a['obj'];p=a['passive'];nom=a['nominal']
                    if split=='train':
                        forms=[('direct',r,True,r),('with-et',v+' את '+d,True,v+' את '+d),
                            ('fronted','את '+d+' כבר '+v,True,'את '+d+' כבר '+v),
                            ('completion','סיימתי '+inf+' '+obj,True,'סיימתי '+inf+' '+obj),
                            ('passive',d+' '+p,True,d+' '+p),
                            ('nominal','השלמתי את '+nom+' '+d,True,'השלמתי את '+nom+' '+d),
                            ('time','לפני רגע '+r,True,r),('only','רק '+r,True,r),
                            ('negative','לא '+r,False,'לא '+r),
                            ('still-negative','עדיין לא '+v+' את '+d,False,'עדיין לא '+v+' את '+d),
                            ('negative-passive',d+' לא '+p,False,d+' לא '+p),
                            ('correction','תיקון לדיווח: לא '+r,False,'לא '+r),
                            ('question','האם צריך '+inf+' '+obj+'?',None,None),
                            ('future','אחר כך אני מתכנן '+inf+' '+obj,None,None),
                            ('meta','לא אמרתי ש'+r,None,None),
                            ('uncertain','אני לא זוכר אם '+r,None,None),
                            ('partial','התחלתי '+inf+' '+obj+' אבל עוד לא סיימתי',None,None),
                            ('quoted-question','שאלתי אם כדאי '+inf+' '+obj,None,None)]
                    elif split=='validation':
                        forms=[('dev-state','כרגע '+d+' '+p+' לגמרי',True,d+' '+p+' לגמרי'),
                            ('dev-finish',nom+' '+d+(' הסתיימה' if a['nominal_female'] else ' הסתיים')+' אצלי',True,nom+' '+d+(' הסתיימה' if a['nominal_female'] else ' הסתיים')+' אצלי'),
                            ('dev-negative','למען הסר ספק, לא '+v+' את '+d,False,'לא '+v+' את '+d),
                            ('dev-partial','יש עוד עבודה עם '+nom+' '+d+', אני באמצע',None,None)]
                    else:
                        forms=[('test-finish','גמרתי עם '+nom+' '+d,True,'גמרתי עם '+nom+' '+d),
                            ('test-assertion','זה מה שעשיתי בפועל: '+v+' את '+d,True,v+' את '+d),
                            ('test-negative','בהודעה הקודמת טעיתי; '+d+' לא '+p,False,d+' לא '+p),
                            ('test-partial','עשיתי חלק מ'+nom+' '+d+', עוד נותר חלק',None,None)]
                    for name,text,value,quote in forms:
                        add(f'{name}-{j}',text,[] if value is None else [(a,value,quote)],'clarify' if value is None else 'report',
                            completed=[a['id']] if name in ['correction','test-negative'] else [])
                a,b,c,d=acts
                if split=='train':
                    for first,second in [(a,b),(c,d)]:
                        prefix=first['report']
                        tail='עוד לא '+second['verb']+' '+second['pronoun']
                        add('pronoun-partial-'+first['id'],prefix+', '+tail,[(first,True,prefix),(second,False,tail)])
                        tail2=second['verb']+' '+second['pronoun']
                        add('pronoun-both-'+first['id'],prefix+' ואז '+tail2,[(first,True,prefix),(second,True,tail2)])
                        text='גם '+tail2
                        add('history-local-'+first['id'],text,[(second,True,text)],previous={'recipe_id':rid,'utterance':prefix})
                        add('history-foreign-'+first['id'],text,intent='clarify',previous={'recipe_id':'different-recipe','utterance':prefix})
                    for left,right in [(a,c),(b,d)]:
                        add('two-objects-'+left['id'],left['report']+' וגם '+right['report'],[(left,True,left['report']),(right,True,right['report'])])
                        neg='לא '+right['report']
                        add('object-contrast-'+left['id'],left['report']+', אבל '+neg,[(left,True,left['report']),(right,False,neg)])
                elif split=='validation':
                    clause=b['subject']+' עדיין לא '+b['passive'];tail='אבל '+clause
                    add('dev-coreference',a['report']+', '+tail,[(a,True,a['report']),(b,False,clause)])
                    text='כעת '+b['verb']+' '+b['pronoun']
                    add('dev-local-context',text,[(b,True,b['verb']+' '+b['pronoun'])],previous={'recipe_id':rid,'utterance':a['report']})
                    add('dev-foreign-context',text,intent='clarify',previous={'recipe_id':'unrelated','utterance':a['report']})
                    add('dev-contrast',a['report']+'; '+c['definite']+' לא '+c['passive'],[(a,True,a['report']),(c,False,c['definite']+' לא '+c['passive'])])
                else:
                    tail='ו'+b['pronoun']+' עדיין לא '+b['verb']
                    add('test-coreference',a['report']+'; '+tail,[(a,True,a['report']),(b,False,b['pronoun']+' עדיין לא '+b['verb'])])
                    text='ובינתיים '+b['verb']+' '+b['pronoun']
                    add('test-local-context',text,[(b,True,b['verb']+' '+b['pronoun'])],previous={'recipe_id':rid,'utterance':a['report']})
                    add('test-foreign-context',text,intent='clarify',previous={'recipe_id':'unrelated','utterance':a['report']})
                    add('test-two-objects',b['report']+'; בנוסף '+d['report'],[(b,True,b['report']),(d,True,d['report'])])
                fixed={
                    'train':[('next','מה הפעולה הבאה שלי?','next'),('next2','איך להמשיך מפה?','next'),
                        ('missed','אילו פעולות קודמות עדיין חסרות?','missed'),('missed2','דילגתי על פעולה בדרך?','missed'),
                        ('advice','אפשר להוסיף חרדל שאינו במתכון?','advice'),('advice2','יש תחליף שלא כתוב בהוראות?','advice'),
                        ('ambiguous','טיפלתי בו','clarify'),('unclear','לא ברור לי מה כבר עשיתי','clarify')],
                    'validation':[('dev-next','תזכיר לי מה נותר לעשות עכשיו','next'),('dev-missed','איזו פעולה השארתי מאחור?','missed'),
                        ('dev-advice','אני מחפש תוספת שאינה רשומה במתכון','advice'),('dev-ambiguous','כבר סידרתי את הדבר הזה','clarify'),
                        ('dev-meta','רק שאלתי על הפעולה, לא דיווחתי שביצעתי אותה','clarify'),('dev-uncertain','ייתכן שביצעתי, אבל אני לא בטוח','clarify')],
                    'test':[('test-next','לאן מתקדמים במתכון מכאן?','next'),('test-missed','מה פספסתי בשלבים שכבר עברתי?','missed'),
                        ('test-advice','תן הצעה לשינוי מעבר להוראות המקור','advice'),('test-ambiguous','עשיתי את ההוא שהיה שם','clarify'),
                        ('test-meta','לא ביצעתי דיווח על השלמה, רק דיברתי על האפשרות','clarify'),('test-uncertain','אינני יודע אם הפעולה בוצעה','clarify')]}[split]
                for name,text,intent in fixed:add(name,text,intent=intent,current=1 if intent=='missed' else 0)
    validate(list(recs.values()),rows)
    return recs,rows


def write(output,recs,rows,origin):
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    counts=validate(list(recs.values()),rows)
    (output/'recipes.json').write_text(json.dumps(list(recs.values()),ensure_ascii=False,indent=2)+'\n')
    for split in ['train','validation','test']:
        (output/f'{split}.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows if r['split']==split))
    files={p.name:digest(p.read_bytes()) for p in output.iterdir()}
    (output/'manifest.json').write_text(json.dumps({'schema':1,'origin':origin,'human_review':'pending','counts':counts,'files':files,'corpus_sha256':digest(files)},ensure_ascii=False,indent=2)+'\n')
    return output


def build(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    recs,new=authored()
    with tempfile.TemporaryDirectory() as tmp:
        old=augmented_data(Path(tmp)/'old');oldrecs,oldrows=load_data(old)
    # Historical holdouts are not used for checkpoint or family selection.
    base_recs={k:v for k,v in oldrecs.items() if v['split']=='train'}
    base_rows=[r for r in oldrows if r['split']=='train']
    heldrecs={k:v for k,v in recs.items() if v['split']!='train'}
    heldrows=[r for r in new if r['split']!='train']
    control=write(output/'control',{**base_recs,**heldrecs},base_rows+heldrows,'Historical augmented training, new synthetic semantic holdouts')
    richer=write(output/'richer',{**base_recs,**recs},base_rows+new,'Historical training plus authored semantic expansion; same holdouts as control')
    for name in ['validation.jsonl','test.jsonl']:
        if (control/name).read_bytes()!=(richer/name).read_bytes():raise ValueError('Comparison holdouts differ')
    audit={'new_counts':validate(list(recs.values()),new),'human_reviewed':False,
        'source_sha256':digest((ROOT/'semantic_data.py').read_bytes()),
        'new_split_sha256':{s:digest([r for r in new if r['split']==s]) for s in ['train','validation','test']},
        'historical_holdout_sha256':{s:digest((ROOT/'data'/f'{s}.jsonl').read_bytes()) for s in ['validation','test']},
        'scope':'Synthetic surface-form/recipe holdouts, not independently collected natural speech or full linguistic-family disjointness',
        'ambiguity_policy':'Meta, uncertainty and partial-action reports do not assert completion; foreign-recipe antecedents are discarded. Negative correction needs an explicit negative assertion.',
        'query_conflicts':audit_queries({**base_recs,**recs},base_rows+new)}
    (output/'data-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n')
    return control,richer,audit


def audit_queries(recs,rows):
    result={}
    for contract in [2,3]:
        seen=defaultdict(set);ids=defaultdict(list)
        for row in rows:
            for q in queries(recs[row['recipe_id']],row,contract):
                key=(q['task'],q['context'],q['utterance']);seen[key].add(q['label']);ids[key].append(row['id'])
        conflicts=[{'examples':ids[k],'labels':sorted(v)} for k,v in seen.items() if len(v)>1]
        result[str(contract)]={'conflicting_effective_inputs':len(conflicts),'examples':conflicts[:6]}
    if result['3']['conflicting_effective_inputs']:raise ValueError('Unlearnable contradictory labels under shared context contract')
    return result


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('output');a=p.parse_args()
    _,_,report=build(a.output);print(json.dumps(report,ensure_ascii=False,indent=2))
