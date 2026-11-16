"""Authored epistemic contrasts on TRAIN recipes only; no teacher-generated labels."""
import copy
import hashlib
import json
from pathlib import Path
import random
from sparse_recipe_data_v3 import RECIPES
from sparse_recipe_v3 import validate

ROOT=Path(__file__).resolve().parent


def constructions(a,b):
    p,q,inf=a['past'],b['past'],a['inf']
    # Each tuple: text, reported role/status pairs, clarification roles, intent.
    # These are authored synthetic constructions, not recordings or human-reviewed data.
    return [
      ('resolved-doubt',[
        (f'הייתי בספק אם {p}. בדקתי וזה מאומת: {p} עד הסוף.', [('a','done')], [], 'report'),
        (f'{p}, לפחות זה מה שחשבתי. כעת אני לא זוכר אם זה באמת קרה.', [], ['a'], 'clarify')]),
      ('partial-certainty',[
        (f'הספקתי לבצע רק חלק מהפעולה "{inf}". נשאר לי עוד, וזה מצב הביצוע שאני מדווח.', [('a','partial')], [], 'report'),
        (f'אולי הספקתי לבצע חלק מהפעולה "{inf}"; אני לא מסתמך על זה כדיווח ודאי.', [], ['a'], 'clarify')]),
      ('negative-certainty',[
        (f'לגבי הפעולה "{inf}" — לא התחלתי אותה בכלל. זאת עובדה ברורה.', [('a','pending')], [], 'report'),
        (f'לגבי הפעולה "{inf}" — אני לא בטוחה אם היא נעשתה או שלא. הזיכרון שלי לא מספיק כדי להכריע.', [], ['a'], 'clarify')]),
      ('doubt-scope',[
        (f'אולי שכחתי לסגור את החלון; בבישול אין לי ספק: {p}.', [('a','done')], [], 'report'),
        (f'החלון סגור בוודאות, אבל בבישול אני בספק אם {p}.', [], ['a'], 'clarify')]),
      ('plan-versus-performance',[
        (f'בהתחלה זאת הייתה רק תוכנית, אבל מאז {p}. הביצוע כבר הושלם.', [('a','done')], [], 'report'),
        (f'זאת תוכנית בלבד: {inf} בהמשך. אינני מתאר כאן משהו שביצעתי.', [], [], 'other')]),
      ('correction-direction',[
        (f'אני מתקן את מה שאמרתי קודם: אמרתי שסיימתי, אבל בפועל רק התחלתי {inf} והפסקתי באמצע.', [('a','partial')], [], 'report'),
        (f'אני מתקן את מה שאמרתי קודם: אמרתי שלא סיימתי, אבל עכשיו אני מאשר — {p} והכול הושלם.', [('a','done')], [], 'report')]),
      ('actual-versus-fictional-next',[
        (f'{p}. איזו הוראה מגיעה עכשיו מבחינתי?', [('a','done')], [], 'next'),
        (f'בתסריט שהמצאתי, {p}. איזו הוראה הייתה באה אחר כך בתסריט? אינני מתאר ביצוע אמיתי.', [], [], 'explain')]),
      ('report-versus-editing',[
        (f'אני מדווח על מה שקרה במטבח, לא על דוגמה: {p}.', [('a','done')], [], 'report'),
        (f'אני מבקש לערוך דוגמה: "{p}". זה אינו דיווח שלי על מה שקרה במטבח.', [], [], 'other')]),
      ('clause-local-uncertainty',[
        (f'{p}; לעומת זאת עוד לא {q}. שני החלקים האלה ודאיים מבחינתי.', [('a','done'),('b','pending')], [], 'report'),
        (f'אינני יודע אם {p}; לעומת זאת עוד לא {q}, ואת החלק השני אני יודע בוודאות.', [('b','pending')], ['a'], 'report')]),
      ('future-versus-partial-clause',[
        (f'לגבי "{inf}", ביצעתי רק חלק ולא סיימתי. בנפרד, {q} וכבר סיימתי את זה.', [('a','partial'),('b','done')], [], 'report'),
        (f'לגבי "{inf}", זאת רק תוכנית לעתיד ולא דיווח על ביצוע. בנפרד, {q} וכבר סיימתי את זה.', [('b','done')], [], 'report')]),
      ('history-resolution',[
        ('בוצע. סיימתי עם זה.', [('a','done')], [], 'report'),
        ('בוצע. סיימתי עם זה.', [], [None], 'clarify')]),
      ('reported-versus-queried-missing',[
        (f'עוד לא {p}, אבל {q}. לפי מה שנשאר, איזה שלב חסר לי?', [('a','pending'),('b','done')], [], 'missed'),
        ('בלי לדווח על פעולה חדשה, תבדוק מה נשאר לי להשלים במתכון.', [], [], 'missed')]),
    ]


def native_rows():
    rows=[]
    for ri,(split,name,actions) in enumerate(r for r in RECIPES if r[0]=='train'):
        for pi in range(12):
            rng=random.Random(101600+100*ri+pi)
            ids=rng.sample([f'a{i}' for i in range(10)],len(actions))
            ai=(pi+ri)%len(actions);bi=(ai+1+(pi//4+ri)%3)%len(actions)
            roles={'a':ids[ai],'b':ids[bi]}
            fixture_id=hashlib.sha256(f'101600:{ri}:{pi}'.encode()).hexdigest()[:12]
            recipe={'id':'native-scope-'+fixture_id,'version':'source-1','name':name,
                'actions':[{'id':id,'source':a['source'],'step':i} for i,(id,a) in enumerate(zip(ids,actions))]}
            progress={id:rng.choice(['pending','partial','done']) for id in ids};navigation=rng.randrange(len(actions))
            kind,variants=constructions(actions[ai],actions[bi])[pi]
            for vi,(text,fs,cs,intent) in enumerate(variants):
                history=[]
                if kind=='history-resolution':
                    content=('ההוראה שעליה דיברנו היא: '+actions[ai]['source']) if vi==0 else (
                        'יש שתי הוראות אפשריות: '+actions[ai]['source']+' או '+actions[bi]['source']+' עדיין לא בחרנו לאיזו מתייחסים.')
                    history=[{'role':'assistant','content':content}]
                request={'recipe':copy.deepcopy(recipe),'progress':progress.copy(),'currentStep':navigation,'history':history,'utterance':text}
                expected={'intent':intent,'facts':[{'action':roles[role],'status':status} for role,status in fs],
                    'clarify':[roles[c] if c is not None else None for c in cs]}
                validate(expected,request)
                rows.append({'id':f'native-v10-r{ri}-p{pi}-v{vi}','family':'native-'+kind,'training_origin':'native',
                    'pair':f'native-v10-r{ri}-p{pi}','variant':vi,'pair_axis':'history' if kind=='history-resolution' else 'utterance',
                    'role_positions':{'a':ai,'b':bi},
                    'input':request,'expected':expected,'critical_no_facts':not fs,
                    'provenance':'Assistant-authored synthetic construction on original TRAIN recipe; no teacher labels or real audio.'})
    return rows


def build():
    original=json.loads((ROOT/'verification/sparse-recipe-control-data-v5-20261116.json').read_text())
    train=copy.deepcopy(original['splits']['train']);native=native_rows();rng=random.Random(10162026)
    names=list(dict.fromkeys(r['input']['recipe']['name'] for r in native));kept=set();replacement={}
    retained_families=['partial','multiple','correction','uncertainty','reference','question']
    for name in names:
        diverse=[(i,r) for i,r in enumerate(train) if r['training_origin']=='diverse' and r['input']['recipe']['name']==name]
        assert len(diverse)==30
        for family in retained_families:
            choices=[i for i,r in diverse if r['family']==family];assert choices
            kept.add(rng.choice(choices))
        slots=[i for i,r in diverse if i not in kept]
        fresh=[copy.deepcopy(r) for r in native if r['input']['recipe']['name']==name]
        assert len(slots)==len(fresh)==24
        for i,row in zip(slots,fresh):
            row['replaced_train_id']=train[i]['id'];replacement[str(i)]=train[i]['id'];train[i]=row
    assert len(kept)==36 and len(replacement)==144
    groups={origin:[r for r in train if r['training_origin']==origin] for origin in ['old','diverse','native']}
    fit=[]
    for rows in groups.values():fit+=rng.sample(rows,12)
    result=copy.deepcopy(original);result['splits']['train']=train;result['splits']['train_fit']=fit
    result['native_metadata']={'recipes':len(names),'recipe_fixtures':72,'pair_types':12,'paired_scenarios':72,'native_rows':144,
        'training_counts':{k:len(v) for k,v in groups.items()},'replacement_slots':replacement,
        'unique_native_utterances':len({r['input']['utterance'] for r in native}),
        'scope':'Constructed from TRAIN recipes only.360 total with all180 old rows unchanged,36 diverse retained,144 paired epistemic examples. Inference prompt and model unchanged. No real speech or independent human review.'}
    return result


if __name__=='__main__':
    value=build();path=ROOT/'verification/native-scope-data-v10-20261116.json'
    with path.open('x') as stream:stream.write(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(value['native_metadata'],ensure_ascii=False,indent=2))
