"""Fresh V11 text fixtures; same6638 training rows. State probes kept separate."""
import json
from pathlib import Path
import tempfile
from corpus import ROOT,digest,load_data,validate,queries
from sampling_data import build as previous_build
from combined_data import row,holdouts as broad_holdouts
from semantic_data import write,audit_queries

SPECS={
 'validation':{
  'add':[('קמח כוסמין','חלב שיבולת שועל','סוכר חום','בלילה'),('רסק פלפלים','מיץ עגבניות','סירופ אורז','רוטב'),
         ('גרגרי חומוס','מלפפון חמוץ','שמיר יבש','סלט'),('גרנולה','מחית תפוח','שבבי שקדים','תערובת')],
  'prep':[('שורש פטרוזיליה','פטריות פורטובלו'),('פלפל כתום','צנון שחור'),('עגבניות שרי','שעועית ירוקה'),('תפוח ירוק','נקטרינה לבנה')]},
 'test':{
  'add':[('קמח שקדים','מי סלק','אבקת קינמון','בלילה'),('ממרח שקדים','חומץ תפוחים','פלפל לבן','רוטב'),
         ('עדשים שחורות','צנון כבוש','נבטי עדשים','סלט'),('קוביות דלעת','ציר פטריות','שומשום שחור','תבשיל')],
  'prep':[('דלעת ערמונים','פטריות שמפיניון'),('פלפל חריף','מלפפון בלאדי'),('כרוב ניצנים','אספרגוס ירוק'),('אגס אדום','אפרסמון רך')]}}


def heldouts():
    recs={};rows=[]
    for split,kinds in SPECS.items():
        for kind,specs in kinds.items():
            for n,spec in enumerate(specs):
                rid=f'grounding-{split}-{kind}-{n}';a,b=spec[:2]
                if kind=='add':
                    _,_,c,mix=spec;actions=[('להוסיף '+v,'הוספתי '+v) for v in (a,b,c)]+[('לערבב את ה'+mix,'ערבבתי את ה'+mix)]
                else:actions=[('לשטוף '+a,'שטפתי '+a),('לחתוך '+a,'חתכתי '+a),('לשטוף '+b,'שטפתי '+b),('לחתוך '+b,'חתכתי '+b)]
                acts=[{'id':f'a{i}','step':i//2,'text':t,'report':r} for i,(t,r) in enumerate(actions)]
                recipe={'id':rid,'split':split,'title':'הכנה עם '+a+' ו'+b,'ingredients':list(spec),'actions':acts};recs[rid]=recipe
                def add(name,text,changes=(),intent='report',**kw):
                    v=row(recipe,name,text,[(acts[i],done,quote) for i,done,quote in changes],intent,**kw)
                    v['family']=split+':grounding:'+name;rows.append(v)
                for j,act in enumerate(acts):
                    r=act['report'];negative=('עד לנקודה הזאת לא ' if split=='validation' else 'נכון לעכשיו, עדיין לא ')+r
                    positive=('מעדכן כדי שנמשיך: ' if split=='validation' else 'הנה הדיווח המדויק שלי: ')+r
                    add(f'direct-{j}',positive,[(j,True,r)])
                    add(f'negative-{j}',negative,[(j,False,negative)])
                    correction=('העדכון הקודם לא היה מדויק — ' if split=='validation' else 'אני חוזר לדייק את הדיווח הקודם: ')+negative
                    add(f'correction-{j}',correction,[(j,False,negative)],completed=[act['id']],previous={'recipe_id':rid,'utterance':r})
                    uncertain=('אין לי דרך לוודא אם ' if split=='validation' else 'זה לא ודאי מבחינתי ש')+r
                    add(f'uncertain-{j}',uncertain,intent='clarify')
                if kind=='add':
                    for j,obj in enumerate((a,b,c)):
                        clause=('כרגע ה'+mix+' כולל '+obj if split=='validation' and mix in ('רוטב','סלט') else 'יש '+obj+' בתערובת שכבר הכנתי') if split=='validation' else 'בפנים כבר יש '+obj+', בתוך ה'+mix
                        add(f'implicit-{j}',clause,[(j,True,clause)])
                    verb='שמתי ' if split=='validation' else 'הכנסתי '
                    clause=verb+a+(' וגם ' if split=='validation' else ' יחד עם ')+b
                    negative='לא ערבבתי את ה'+mix+' עד עכשיו'
                    add('shared-predicate',clause,[(0,True,verb+a),(1,True,clause)])
                    add('partial-step',clause+'; '+negative,[(0,True,verb+a),(1,True,clause),(3,False,negative)])
                    # Use an indefinite-object negative without relying on definiteness morphology.
                    neg='עוד לא הוספתי '+b
                    add('object-contrast',acts[0]['report']+'; '+neg,[(0,True,acts[0]['report']),(1,False,neg)])
                    reference=('את המרכיב האחרון שהזכרתי הכנסתי גם כן' if split=='validation' else 'כבר הכנסתי את אותו מרכיב שעליו דיברתי')
                    target=0
                else:
                    for j,obj in enumerate((a,b)):
                        clause=('סיימתי לטפל בחיתוך של '+obj if split=='validation' else 'פעולת החיתוך של '+obj+' כבר מאחוריי')
                        add(f'completion-{j}',clause,[(j*2+1,True,clause)])
                    clause='שטפתי '+a+(' וגם ' if split=='validation' else ' יחד עם ')+b
                    add('shared-predicate',clause,[(0,True,'שטפתי '+a),(2,True,clause)])
                    negative='עדיין לא חתכתי '+a
                    add('partial-step',acts[0]['report']+'; '+negative,[(0,True,acts[0]['report']),(1,False,negative)])
                    negative='לא שטפתי '+b+' עד עכשיו'
                    add('object-contrast',acts[0]['report']+'; '+negative,[(0,True,acts[0]['report']),(2,False,negative)])
                    reference=('אחר כך חתכתי את המרכיב שציינתי' if split=='validation' else 'כשגמרתי לשטוף חתכתי את אותו מרכיב')
                    target=1
                previous={'recipe_id':rid,'utterance':acts[0]['report']}
                add('history-local',reference,[(target,True,reference)],previous=previous)
                add('history-foreign',reference,intent='clarify',previous={**previous,'recipe_id':'previous-recipe'})
                confirmed=acts[2]['report'];question=('מה נדרש בהמשך?' if split=='validation' else 'מה מחכה לי עכשיו בהוראות?')
                add('report-question',confirmed+', '+question,[(2,True,confirmed)])
                add('uncertain-confirmed',('אני לא יודע אם '+acts[0]['report']+', אבל בוודאות ' if split=='validation' else 'ייתכן ש'+acts[0]['report']+'; מה שבטוח הוא: ')+confirmed,[(2,True,confirmed)])
                fixed={
                 'validation':[('partial','עשיתי רק חלק מהפעולה, נותר עוד ממנה','clarify'),('meta','ציינתי את האפשרות לביצוע בלבד, לא אישרתי אותו','clarify'),('future','אני עדיין מתכונן לביצוע ולא התחלתי','clarify'),('next','תדריך אותי איזו פעולה לבצע מכאן','next'),('missed','תזכיר מה נותר פתוח בחלק הקודם של ההכנה','missed'),('advice','יש שינוי שהיית ממליץ עליו מעבר למתכון הנתון?','advice')],
                 'test':[('partial','ביצעתי חלק מהעבודה אבל נותר המשך לאותה פעולה','clarify'),('meta','האזכור היה בגדר שאלה על ביצוע ולא דיווח','clarify'),('future','הפעולה עוד ממתינה, אני רק עומד להתחיל בה','clarify'),('next','מה מגיע כעת בתור בהוראות האלה?','next'),('missed','מה נשאר לי להשלים מהשלב שלפני הנוכחי?','missed'),('advice','איזה רעיון נוסף שלך יכול להתאים מעבר לכתוב?','advice')]}[split]
                for name,text,intent in fixed:add(name,text,intent=intent,current=1 if intent=='missed' else 0)
    validate(list(recs.values()),rows);return recs,rows


def state_information_probes(recipe):
    """Counterfactuals outside the primary benchmark: only state varies."""
    text='סיימתי את הפעולה היחידה שנותרה בשלב הנוכחי'
    result=[]
    for target in range(4):
        step=recipe['actions'][target]['step'];other=[a['id'] for a in recipe['actions'] if a['step']==step and a['id']!=recipe['actions'][target]['id']]
        r=row(recipe,f'state-reference-{target}',text,[(recipe['actions'][target],True,text)],completed=other,current=step)
        r['family']='diagnostic:state-information';result.append(r)
    return result


def build(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    with tempfile.TemporaryDirectory() as tmp:
        prior,_=previous_build(Path(tmp)/'v10');r,x=load_data(prior)
    r={k:v for k,v in r.items() if v['split']=='train'};x=[v for v in x if v['split']=='train']
    hr,hx=heldouts();br,bx=broad_holdouts();br={k:v for k,v in br.items() if v['split']=='validation'};bx=[v for v in bx if v['split']=='validation']
    data=write(output/'shared',{**r,**hr,**br},x+hx+bx,'V11 unchanged V9/V10 training; new authored grounding holdouts')
    probes=[p for recipe in hr.values() if recipe['split']=='validation' for p in state_information_probes(recipe)]
    # These probes intentionally expose missing state under contract3. They are
    # not inserted into training/validation/test or the primary accuracy metric.
    (output/'state-information-probes.json').write_text(json.dumps(probes,ensure_ascii=False,indent=2)+'\n')
    seen={}
    for p in probes:
        for q in queries(hr[p['recipe_id']],p,3):
            key=(q['task'],q['context'],q['utterance'])
            seen.setdefault(key,set()).add(q['label'])
    proof={'study':'grounding-v11','training_examples':len(x),'training_rows_sha256':digest(x),
        'fresh_counts':validate(list(hr.values()),hx),'query_conflicts':audit_queries({**r,**hr,**br},x+hx+bx),
        'state_probes':len(probes),'legacy_state_probe_conflicts':sum(len(v)>1 for v in seen.values()),'state_probe_role':'Information diagnostic only, excluded from primary metrics',
        'human_reviewed':False,'source_sha256':digest((ROOT/'grounding_data.py').read_bytes()),
        'scope':'Authored text and recipe holdouts; shared phenomena, not natural conversation or independent human annotation'}
    (output/'data-audit.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
    return data,proof
