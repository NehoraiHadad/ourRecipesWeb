"""V12 counterfactual progress reports, fresh recipe/text holdouts and guardrails."""
import json
from pathlib import Path
import tempfile
from corpus import ROOT,digest,load_data,validate
from sampling_data import build as old_build
from combined_data import row,holdouts
from semantic_data import write

PAIRS={
 'train':[('קמח אורז','מי קוקוס'),('טחינה','מיץ תפוחים'),('אפונה','תירס'),('גריסים','ציר ירקות'),('קוסקוס','מים פושרים'),('קקאו','חלב'),('אגוזים','יוגורט'),('קוואקר','מחית בננה'),
          ('גזר לבן','סלק אדום'),('בצל סגול','כרוב לבן'),('תפוח עץ','אגס בשל'),('קישוא עגול','בטטה כתומה'),('לפת לבנה','צנונית'),('מלפפון','פלפל ירוק'),('פטריות','עגבנייה'),('שומר','כרישה')],
 'validation':[('פתיתי כוסמין','מי גזר'),('שעועית לבנה','מיץ רימונים'),('ממרח פיסטוק','משקה אורז'),('בורגול דק','ציר בצל'),('לפת סגולה','גזר צהוב'),('דלורית קטנה','פלפל שושקה'),('קולרבי ירוק','צנון אדום'),('תפוח פינק','אגס קיץ')],
 'test':[('גרגרי אמרנט','מי אננס'),('מחית ערמונים','משקה אגוזים'),('עדשים כתומות','ציר כרישה'),('פתיתי שיפון','מיץ אגסים'),('כרוב סיני','פלפל מתוק'),('בטטה סגולה','קישוא צהוב'),('צנון לבן','שורש סלרי'),('אגס חורף','תפוח מוזהב')]}
FORMS={
 'train':{'done':['סיימתי את הפעולה היחידה שנותרה בשלב הנוכחי','המשימה היחידה שנותרה בשלב הזה כבר בוצעה'],
 'not_done':['את הפעולה היחידה שנותרה בשלב הנוכחי עוד לא ביצעתי','המשימה היחידה שעוד פתוחה בשלב הזה עדיין לא הושלמה'],
 'undo':['תיקון: הפעולה היחידה שסימנתי כמושלמת בשלב הנוכחי לא הושלמה באמת','אני מתקן: המשימה היחידה שרשומה כבוצעה בשלב הזה טרם בוצעה']},
 'validation':{'done':['הפעולה היחידה שעוד חיכתה בשלב הזה כבר מאחוריי','סיימתי את המשימה שנותרה לי בשלב שאני נמצא בו'],
 'not_done':['הדבר היחיד שעוד נותר לבצע בשלב הנוכחי עדיין ממתין','הפעולה היחידה הפתוחה בחלק הזה של ההכנה לא בוצעה עדיין'],
 'undo':['תיקון דיווח: המשימה היחידה שמסומנת אצלי כהושלמה בשלב הנוכחי בעצם לא הושלמה','אני חוזר בי לגבי הפעולה היחידה שרשומה כגמורה בשלב הזה: היא לא בוצעה']},
 'test':{'done':['עכשיו גם הדבר היחיד שעוד לא הושלם בשלב הזה בוצע','הפעולה היחידה שעוד היתה פתוחה בשלב הזה הושלמה כעת'],
 'not_done':['המשימה האחרונה שנותרה פתוחה בשלב הזה טרם נעשתה','אותה משימה יחידה שנותרה לי בשלב הזה עוד לא הושלמה'],
 'undo':['אני מתקן את הרישום: הדבר היחיד שסומן כבוצע בחלק הנוכחי לא נעשה','למעשה לא השלמתי את המשימה היחידה שסומנה כגמורה בשלב שבו אני נמצא']}}


def authored():
    recs={};rows=[]
    for split,pairs in PAIRS.items():
        for n,(a,b) in enumerate(pairs):
            add_kind=n<len(pairs)//2;rid=f'state12-{split}-{n}'
            specs=[('להוסיף '+a,'הוספתי '+a),('להוסיף '+b,'הוספתי '+b),('להוסיף מלח דק','הוספתי מלח דק'),('לערבב את התערובת','ערבבתי את התערובת')] if add_kind else [('לשטוף '+a,'שטפתי '+a),('לחתוך '+a,'חתכתי '+a),('לשטוף '+b,'שטפתי '+b),('לחתוך '+b,'חתכתי '+b)]
            acts=[{'id':f'a{(j+n)%4}','step':j//2,'text':t,'report':r} for j,(t,r) in enumerate(specs)]
            recipe={'id':rid,'split':split,'title':'תרגיל התקדמות עם '+a+' ו'+b,'ingredients':[a,b,'מלח דק'] if add_kind else [a,b],'actions':acts};recs[rid]=recipe
            def add(name,text,changes=(),intent='report',completed=(),current=0,previous=None,kind='state'):
                x=row(recipe,name,text,[(acts[j],done,quote) for j,done,quote in changes],intent,completed=completed,current=current,previous=previous)
                x['family']=split+':state12:'+name;x['evaluation_kind']=kind
                x['counterfactual_group']=rid+'-'+name.split('/')[0] if kind=='state' else None
                rows.append(x)
            for mode,forms in FORMS[split].items():
                for f,text in enumerate(forms):
                    for j,act in enumerate(acts):
                        current=act['step'];other=[v['id'] for v in acts if v['step']==current and v['id']!=act['id']]
                        outside=[v['id'] for v in acts if v['step']!=current]
                        for extra in (False,True):
                            completed=([act['id']] if mode=='undo' else other)+(outside if extra else [])
                            add(f'state-{mode}-{f}/{j}-{int(extra)}',text,[(j,mode=='done',text)],completed=completed,current=current)
                    for current in (0,1):
                        inside=[v['id'] for v in acts if v['step']==current];outside=[v['id'] for v in acts if v['step']!=current]
                        for extra in (False,True):
                            add(f'state-{mode}-{f}/ambiguous-{current}-{int(extra)}',text,intent='clarify',completed=(inside if mode=='undo' else [])+(outside if extra else []),current=current)
            prefix={'train':'רושם את ההתקדמות שלי: ','validation':'הנה עדכון מההכנה כאן: ','test':'זה הדיווח הנוכחי מהמטבח: '}[split]
            for j,act in enumerate(acts):
                r=act['report'];negative='עדיין לא '+r
                for name,text,value in [('direct',r,True),('negative',negative,False),('correction','תיקון שלי: '+negative,False)]:
                    add(f'{name}-{j}',prefix+text,[(j,value,text)],completed=[act['id']] if name=='correction' else [],kind='guardrail')
            text=prefix+acts[0]['report']+'; עדיין לא '+acts[1]['report']
            add('partial-step',text,[(0,True,acts[0]['report']),(1,False,'עדיין לא '+acts[1]['report'])],kind='guardrail')
            ref={'train':'את מה שהזכרתי קודם הוספתי גם כן' if add_kind else 'אחר כך חתכתי את אותו אחד',
                 'validation':'המרכיב שהזכרתי קודם כבר בפנים' if add_kind else 'המרכיב שדיברתי עליו גם נחתך',
                 'test':'גם המרכיב שציינתי בהודעה הקודמת הוכנס' if add_kind else 'את אותו מרכיב מהדיווח הקודם כבר חתכתי'}[split]
            previous={'recipe_id':rid,'utterance':acts[0]['report']};target=0 if add_kind else 1
            add('history-local',ref,[(target,True,ref)],previous=previous,kind='guardrail')
            add('history-foreign',ref,intent='clarify',previous={**previous,'recipe_id':'other-recipe'},kind='guardrail')
            confirmed=acts[2]['report'];text=prefix+'אני לא בטוח אם '+acts[0]['report']+'; אבל בוודאות '+confirmed
            add('uncertain-confirmed',text,[(2,True,confirmed)],kind='guardrail')
            for name,intent in [('next','next'),('missed','missed'),('advice','advice'),('uncertain','clarify')]:
                phrase={'next':'מה לבצע אחרי כל זה?','missed':'איזו פעולה קודמת עוד לא הושלמה?','advice':'איזה שינוי היית מציע מעבר להוראות?','uncertain':'אני לא בטוח מה בדיוק הושלם'}[name]
                add(name,prefix+phrase,intent=intent,current=1 if name=='missed' else 0,kind='guardrail')
    validate(list(recs.values()),rows);return recs,rows


def build(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    with tempfile.TemporaryDirectory() as tmp:
        data,_=old_build(Path(tmp)/'previous');oldr,oldx=load_data(data)
    oldr={k:v for k,v in oldr.items() if v['split']=='train'};oldx=[r for r in oldx if r['split']=='train']
    r,x=authored();br,bx=holdouts();br={k:v for k,v in br.items() if v['split']=='validation'}
    bx=[{**v,'evaluation_kind':'guardrail','counterfactual_group':None} for v in bx if v['split']=='validation']
    data=write(output/'shared',{**oldr,**r,**br},oldx+x+bx,'V12 unchanged6638 base train plus counterfactual state data; fresh state/guardrail heldouts')
    audit={'study':'state-v12','base_training_rows':len(oldx),'base_training_sha256':digest(oldx),
        'new_counts':validate(list(r.values()),x),'counterfactual_semantics':'same utterance changes target solely through explicit current/completed state; ambiguous multiple targets require clarification',
        'corpus_sha256':json.loads((data/'manifest.json').read_text())['corpus_sha256'],
        'human_reviewed':False,'physical_device_tested':False,'original_test_scored':False}
    (output/'data-audit.json').write_text(json.dumps(audit,indent=2)+'\n');return data,audit
