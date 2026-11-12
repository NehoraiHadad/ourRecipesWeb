"""V10: unchanged V9 training, new authored matched validation/test fixtures."""
import json
from pathlib import Path
import tempfile
from corpus import ROOT,digest,load_data,validate
from focused_data import build as prior_build
from combined_data import row,holdouts as broad_holdouts
from semantic_data import write,audit_queries

SPECS={
 'validation':{
  'add':[('עמילן תירס','סירופ מייפל','מי ורדים','תערובת'),
         ('רוטב טריאקי','חומץ אורז','זרעי כוסברה','רוטב'),
         ('פתיתי כוסמין','זרעי פשתן','מיץ רימון','בלילה'),
         ('שעועית לבנה','גרגירי תירס','אצות','סלט')],
  'prep':[('כרוב סגול','פטריות'),('תפוח אדמה','קולרבי'),('סלרי','עלי מנגולד'),('גזר לבן','דלורית')]},
 'test':{
  'add':[('קמח חומוס','סודה לשתייה','זרעי ציה','בלילה'),
         ('מחית קשיו','סירופ אגבה','גרידת לימון','רוטב'),
         ('אטריות אורז','נבטי חמנייה','מיץ אשכוליות','סלט'),
         ('פתיתי קוקוס','אבקת חלבון','מי חומוס','תערובת')],
  'prep':[('כרובית','פטריות שיטאקי'),('בטטה סגולה','ארטישוק ירושלמי'),('סלק צהוב','עלי קייל'),('כרישה','צנונית')]}}


def heldouts():
    recs={};rows=[]
    for split,groups in SPECS.items():
        for kind,specs in groups.items():
            for n,spec in enumerate(specs):
                rid=f'sampling-{split}-{kind}-{n}'
                if kind=='add':
                    a,b,c,mix=spec;objects=[a,b,c]
                    actions=[('להוסיף '+v,'הוספתי '+v) for v in objects]+[('לערבב את ה'+mix,'ערבבתי את ה'+mix)]
                else:
                    a,b=spec;objects=[a,b]
                    actions=[('לשטוף '+a,'שטפתי '+a),('לחתוך '+a,'חתכתי '+a),('לשטוף '+b,'שטפתי '+b),('לחתוך '+b,'חתכתי '+b)]
                acts=[{'id':f'a{i}','step':i//2,'text':text,'report':report} for i,(text,report) in enumerate(actions)]
                recipe={'id':rid,'split':split,'title':'תרגיל הכנה עם '+a+' ו'+b,'ingredients':list(spec),'actions':acts};recs[rid]=recipe
                def add(name,text,effects=(),intent='report',**kw):
                    value=row(recipe,name,text,[(acts[i],v,q) for i,v,q in effects],intent,**kw)
                    value['family']=split+':sampling:'+name;rows.append(value)
                prefix='עדכון מפורט מהמטבח: ' if split=='validation' else 'לגבי ההכנה אצלי היום: '
                for j,act in enumerate(acts):
                    report=act['report'];negative=('עד עכשיו לא ' if split=='validation' else 'טרם ')+report
                    add(f'direct-{j}',prefix+report,[(j,True,report)])
                    add(f'negative-{j}',prefix+negative,[(j,False,negative)])
                    correction=('אני מתקן את העדכון האחרון: ' if split=='validation' else 'צריך לשנות את מה שאמרתי: ')+negative
                    add(f'correction-{j}',correction,[(j,False,negative)],completed=[act['id']],previous={'recipe_id':rid,'utterance':report})
                    uncertain=('לא הצלחתי להיזכר אם ' if split=='validation' else 'אני מתקשה לאשר שבאמת ')+report
                    add(f'uncertain-{j}',uncertain,intent='clarify')
                if kind=='add':
                    for j,obj in enumerate(objects):
                        clause=('יש '+obj+' בתוך ה'+mix+' עכשיו' if split=='validation' else obj+' כבר בתוך ה'+mix+' אצלי')
                        add(f'implicit-{j}',prefix+clause,[(j,True,clause)])
                        partial=('בינתיים הוספתי רק חלק מהכמות של ' if split=='validation' else 'שמתי עד כה רק קצת מתוך הכמות של ')+obj
                        add(f'partial-{j}',partial,intent='clarify')
                        location=('מצאתי '+obj+' בארון, לא זוכר אם כבר הוספתי' if split=='validation' else 'יש '+obj+' על המדף, אני לא יודע אם שמתי משהו ממנו')
                        add(f'elsewhere-{j}',location,intent='clarify')
                    verb='הכנסתי ' if split=='validation' else 'שמתי '
                    clause=verb+a+(' יחד עם ' if split=='validation' else ' וגם ')+b
                    first=verb+a;negmix='עוד לא ערבבתי את ה'+mix
                    add('shared-verb',prefix+clause,[(0,True,first),(1,True,clause)])
                    add('shared-verb-partial',clause+'; '+negmix,[(0,True,first),(1,True,clause),(3,False,negmix)])
                    neg='עדיין לא הוספתי '+b
                    add('object-contrast',acts[0]['report']+'; '+neg,[(0,True,acts[0]['report']),(1,False,neg)])
                    unsure='אני לא בטוח אם הוספתי '+a;confirmed=acts[1]['report']
                    add('uncertain-confirmed',unsure+', אבל '+confirmed,[(1,True,confirmed)])
                    question=('מה כדאי לבצע לאחר מכן?' if split=='validation' else 'איזו הוראה נשארה עכשיו?')
                    add('report-question',acts[2]['report']+'; '+question,[(2,True,acts[2]['report'])])
                    reference=('המרכיב שציינתי כבר נמצא בפנים' if split=='validation' else 'לגבי אותו מרכיב, הוא כבר בפנים')
                    previous={'recipe_id':rid,'utterance':acts[0]['report']}
                    add('history-local',reference,[(0,True,reference)],previous=previous)
                    add('history-foreign',reference,intent='clarify',previous={**previous,'recipe_id':'another-recipe'})
                    meta=('רק דיברתי על הוספת '+a+', לא דיווחתי שעשיתי זאת' if split=='validation' else 'האזכור של '+a+' היה שאלה, ולא אישור שהוספתי')
                    add('meta',meta,intent='clarify')
                    future=('בהמשך אני מתכנן להוסיף '+a if split=='validation' else 'אני עומד להוסיף '+a+' בעוד רגע')
                    add('future',future,intent='clarify')
                else:
                    for j,obj in enumerate(objects):
                        ai=j*2+1
                        clause=('חיתוך '+obj+' הסתיים מבחינתי' if split=='validation' else 'אפשר לומר שהחיתוך של '+obj+' הושלם')
                        add(f'nominal-{j}',clause,[(ai,True,clause)])
                        partial=('חתכתי חלק מ'+obj+' אך נשאר עוד לחתוך' if split=='validation' else 'נותרה לי עוד עבודה בחיתוך של '+obj)
                        add(f'partial-{j}',partial,intent='clarify')
                    clause='שטפתי '+a+(' וכן ' if split=='validation' else ' וגם ')+b
                    add('shared-verb',clause,[(0,True,'שטפתי '+a),(2,True,clause)])
                    neg='עוד לא חתכתי '+a
                    add('same-object-operation',acts[0]['report']+'; '+neg,[(0,True,acts[0]['report']),(1,False,neg)])
                    neg='לא שטפתי '+b
                    add('same-verb-object',acts[0]['report']+'; '+neg,[(0,True,acts[0]['report']),(2,False,neg)])
                    reference=('אחרי זה חתכתי את אותו מרכיב' if split=='validation' else 'את המרכיב שעליו דיברנו חתכתי כעת')
                    previous={'recipe_id':rid,'utterance':acts[0]['report']}
                    add('history-local',reference,[(1,True,reference)],previous=previous)
                    add('history-foreign',reference,intent='clarify',previous={**previous,'recipe_id':'another-recipe'})
                    question=('איך מתקדמים אחרי הפעולה הזאת?' if split=='validation' else 'מה לבצע לפי המתכון מכאן והלאה?')
                    add('report-question',acts[3]['report']+'; '+question,[(3,True,acts[3]['report'])])
                    add('other-operation',('לגבי מה שעשיתי: בישלתי ' if split=='validation' else 'הפעולה שביצעתי הייתה בישול של ')+a,intent='clarify')
                fixed={
                 'validation':[('next','מה ההוראה שמגיעה כעת לאחר מה שהושלם?','next'),('missed','תוכל למצוא פעולה מוקדמת שלא סיימתי?','missed'),('advice','יש לך רעיון משלך להוסיף להוראות המקור?','advice'),('question','האם עכשיו אמורים '+acts[0]['text']+'?','clarify')],
                 'test':[('next','לאיזו הוראה במתכון צריך להתקדם בשלב הזה?','next'),('missed','תצביע על משימה שפספסתי בחלק שכבר עברנו','missed'),('advice','אני מבקש המלצה אישית מחוץ למתכון הזה','advice'),('question','כבר כדאי לי '+acts[0]['text']+' בשלב הנוכחי?','clarify')]}[split]
                for name,text,intent in fixed:add(name,text,intent=intent,current=1 if intent=='missed' else 0)
    validate(list(recs.values()),rows);return recs,rows


def build(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    with tempfile.TemporaryDirectory() as tmp:
        _,p,_=prior_build(Path(tmp)/'v9');r,x=load_data(p)
    r={k:v for k,v in r.items() if v['split']=='train'};x=[v for v in x if v['split']=='train']
    hr,hx=heldouts();br,bx=broad_holdouts()
    br={k:v for k,v in br.items() if v['split']=='validation'};bx=[v for v in bx if v['split']=='validation']
    recs={**r,**hr,**br};rows=x+hx+bx
    data=write(output/'shared',recs,rows,'V10: identical V9 training, fresh sampling/contrast validation-test, historical broad validation guardrail')
    proof={'study':'sampling-v10','training_examples':len(x),'new_counts':validate(list(hr.values()),hx),
        'training_rows_sha256':digest(x),'historical_validation_guardrail':len(bx),
        'query_conflicts':audit_queries(recs,rows),'source_sha256':digest((ROOT/'sampling_data.py').read_bytes()),
        'scope':'Authored synthetic recipes and split-specific wording; shared language phenomena/ingredients, not independently collected or human reviewed',
        'prior_test_role':'V9 and older tests are known regressions only; original120 test unscored'}
    (output/'data-audit.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
    return data,proof
