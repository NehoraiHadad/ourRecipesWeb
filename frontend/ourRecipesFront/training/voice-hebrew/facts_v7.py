"""V7 reference facts: semantic outputs are validated against explicit state.
Research-only: direct named actions/multiple claims remain outside this head.
"""
import hashlib,json,random
from pathlib import Path
from collections import defaultdict
from corpus import ROOT

REFS=('remaining','marked','other')
COMMIT=('asserted','uncertain','nonassertion','other')
STATUS=('complete','incomplete','partial','unspecified')
JOINT=tuple((r,c,s) for r in REFS[:2] for c in COMMIT[:2] for s in STATUS[:3])+tuple((r,'nonassertion','unspecified') for r in REFS[:2])+(('other','other','unspecified'),)
DATA=ROOT/'verification/facts-v7-data-20261112.json'
# Each root contains both references, all polarities and all speech-act wrappers.
ROOTS=[
 ('בוצעה','לא בוצעה','בוצעה רק בחלקה'),('הושלמה','טרם הושלמה','הושלמה באופן חלקי'),
 ('גמורה','עדיין לא גמורה','גמורה רק בחלקה'),('נעשתה','לא נעשתה','נעשתה בחלקה בלבד'),
 ('בוצעה במלואה','עוד לא בוצעה','בוצעה רק עד האמצע'),('הושלמה כולה','עדיין לא הושלמה','הושלמה רק עד מחציתה'),
 ('כבר גמורה','עוד לא גמורה','רק חצי גמורה'),('כבר נעשתה','טרם נעשתה','נעשתה רק באופן חלקי'),
 ('בוצעה עד הסוף','עדיין לא בוצעה','בוצעה עד מחציתה'),('כבר הושלמה','לא הושלמה','הושלמה בחלקה בלבד'),
 ('גמורה לחלוטין','בכלל לא גמורה','גמורה עד האמצע'),('נעשתה במלואה','עוד לא נעשתה','נעשתה רק עד האמצע'),
 ('בוצעה בשלמותה','טרם בוצעה','בוצעה חלקית בלבד'),('הושלמה עד הסוף','כלל לא הושלמה','הושלמה עד האמצע'),
 ('גמורה עד הסוף','עדיין אינה גמורה','גמורה בחלקה בלבד'),('נעשתה עד הסוף','עדיין לא נעשתה','נעשתה עד מחציתה'),
 ('בוצעה כולה','בכלל לא בוצעה','בוצעה באופן חלקי'),('הושלמה לגמרי','עוד לא הושלמה','הושלמה רק בחלקה'),
 ('גמורה לגמרי','טרם נגמרה','גמורה באופן חלקי'),('נעשתה בשלמותה','כלל לא נעשתה','נעשתה חלקית בלבד'),
 ('בוצעה לחלוטין','כלל לא בוצעה','בוצעה רק במחציתה'),('הושלמה במלואה','עדיין אינה מושלמת','הושלמה חלקית בלבד'),
 ('גמורה בשלמותה','אינה גמורה עדיין','גמורה רק עד מחציתה'),('נעשתה כולה','בכלל לא נעשתה','נעשתה באופן חלקי'),
]
WRAPPERS={
 'train':('', 'אני מעדכן: ',('אולי ','אני לא בטוח אם ','ייתכן ש'),('האם {}?','לא אמרתי ש{}','רק שאלתי אם {}')),
 'dev':('', 'עדכון: ',('אני משער ש','לא ברור לי אם ','יש אפשרות ש'),('תוכל לבדוק האם {}?','לא דיווחתי ש{}','אם {} מה הלאה?')),
 'calibration':('', 'רק לעדכון: ',('אני מנחש ש','איני יודע אם ','אני מסופק אם '),('אני שואל האם {}?','לא הודעתי ש{}','בהנחה ש{} מה המשמעות?')),
 'test':('', 'עדכון מהמטבח: ',('למיטב הניחוש שלי ','אינני זוכר אם ','יכול להיות ש'),('רציתי לדעת האם {}?','לא טענתי ש{}','נניח ש{} אז אפשר להמשיך?')),
}

def build():
 result={s:[] for s in WRAPPERS};splits=['train']*12+['dev']*4+['calibration']*4+['test']*4
 for group,(predicates,split) in enumerate(zip(ROOTS,splits)):
  pre1,pre2,uncertain,non=WRAPPERS[split]
  for ref,subject in [('remaining','הפעולה שנותרה'),('marked','הפעולה שסומנה כמושלמת')]:
   for status,predicate in zip(STATUS,predicates):
    fact=subject+' '+predicate
    examples=[(p+fact,'asserted',status) for p in (pre1,pre2)]+[(p+fact,'uncertain',status) for p in uncertain]+[(p.format(fact),'nonassertion','unspecified') for p in non]
    for text,c,s in examples:
     result[split].append({'id':f'{split}-{len(result[split])}','text':text,'group':f'root-{group}','label':JOINT.index((ref,c,s)),'semantics':[ref,c,s]})
 # Prior OTHER utterances are a retention pool, NOT an unseen-language benchmark.
 old=json.loads((ROOT/'verification/certainty-v5-data-20261112/language.json').read_text())
 other=[r['text'] for r in old['train'] if r['label']=='other'];other=sorted(set(other));random.Random(42).shuffle(other)
 for i,t in enumerate(other):
  split='train' if i<120 else ('dev','calibration','test')[(i-120)%3]
  result[split].append({'id':f'{split}-other-{i}','text':t,'group':f'old-other-{i}','label':14,'semantics':list(JOINT[14])})
 seen={};groups={}
 for split,rows in result.items():
  for r in rows:
   normalized=' '.join(r['text'].split())
   if normalized in seen and seen[normalized]!=split:raise ValueError('Cross-split duplicate')
   if r['group'] in groups and groups[r['group']]!=split:raise ValueError('Root leakage')
   seen[normalized]=split;groups[r['group']]=split
 return {'schema':'facts-v7','synthetic':True,'human_reviewed':False,'scope':'Single generic reference only; no explicit action or multiple-fact extraction',
 'prior_other_pool_seen_in_earlier_head_training':True,'split_policy':'Root families split before wrappers; prior OTHER retention pool disjoint for new training only','joint_classes':JOINT,'splits':result}


def context(ref,variant):
 # Immutable recipe + explicit partition, including actions outside current step.
 actions=[{'id':'flour','step':0},{'id':'water','step':0},{'id':'mix','step':0},{'id':'bake','step':1}]
 selected=['mix'] if variant in ('unique-a','unique-b') else (['water','mix'] if variant=='ambiguous' else [])
 current=0 if variant!='unique-b' else 1
 if current==1:actions=[{**a,'step':1-a['step']} for a in actions]
 inside=[a['id'] for a in actions if a['step']==current]
 complete=[a['id'] for a in actions if a['step']!=current]+(selected if ref=='marked' else [a for a in inside if a not in selected])
 return {'recipe_id':'recipe-b' if variant=='unique-b' else 'recipe-a','recipe_version':'v1','current_step':current,'actions':actions,'completed':complete,
 'remaining':[a['id'] for a in actions if a['id'] not in complete]}


def apply(fact,state,recipe_id,recipe_version):
 """No mutation; reject stale/invalid state before resolving a model reference."""
 ids=[a['id'] for a in state['actions']];done=state['completed'];remaining=state['remaining']
 if recipe_id!=state['recipe_id'] or recipe_version!=state['recipe_version']:return {'kind':'reject','changes':[]}
 if len(ids)!=len(set(ids)) or len(done)!=len(set(done)) or len(remaining)!=len(set(remaining)) or set(done)&set(remaining) or set(done)|set(remaining)!=set(ids):raise ValueError('Invalid partition')
 if tuple(fact) not in JOINT:raise ValueError('Invalid fact')
 ref,c,s=fact
 if ref=='other':return {'kind':'fallback','changes':[]}
 if c=='nonassertion':return {'kind':'no_update','changes':[]}
 if c!='asserted' or s not in ('complete','incomplete'):return {'kind':'clarify','changes':[]}
 candidates=[a['id'] for a in state['actions'] if a['step']==state['current_step'] and a['id'] in (remaining if ref=='remaining' else done)]
 if len(candidates)!=1:return {'kind':'clarify','changes':[]}
 target=candidates[0];value=s=='complete';effective=(target in done)!=value
 return {'kind':'report','changes':[{'action_id':target,'completed':value}],'effective_changes':int(effective),'correction':int(effective and not value)}


def score(rows,pred,threshold):
 counters=defaultdict(int);cases=[]
 for row,(label,confidence) in zip(rows,pred):
  gold=JOINT[row['label']];actual=JOINT[label] if confidence>=threshold else ('remaining','uncertain','unspecified')
  # Threshold abstention isn't a semantic class, and never calls apply with invalid triple.
  for variant in ('unique-a','unique-b','ambiguous','zero'):
   state=context(gold[0],variant);expected=apply(gold,state,state['recipe_id'],'v1')
   got=apply(actual,state,state['recipe_id'],'v1') if confidence>=threshold else {'kind':'clarify','changes':[]}
   true=bool(got['changes']) and got['changes']==expected['changes'];wrong=bool(got['changes']) and not true
   ef=got.get('effective_changes',0);ex=expected.get('effective_changes',0);co=expected.get('correction',0)
   counters['cases']+=1;counters['proposed']+=bool(got['changes']);counters['true_proposals']+=true;counters['false_proposals']+=wrong
   counters['expected_effective']+=ex;counters['correct_effective']+=int(true)*ex;counters['false_effective']+=int(wrong)*ef
   counters['expected_corrections']+=co;counters['correct_corrections']+=int(true)*co
   counters['noop_confirmations']+=int(true and not ex);counters['unsafe_changes']+=int(bool(got['changes']) and gold[1]!='asserted')
   counters['ambiguous_clear']+=int(variant in ('ambiguous','zero') and expected['kind']=='clarify' and got['kind']=='clarify')
   if wrong or (ex and not true):cases.append({'id':row['id'],'text':row['text'],'variant':variant,'gold':gold,'pred':JOINT[label],'confidence':confidence,'expected':expected,'actual':got})
 for name,num,den in [('effective_recall','correct_effective','expected_effective'),('correction_recall','correct_corrections','expected_corrections')]:counters[name]=counters[num]/max(1,counters[den])
 return {**counters,'failures':cases}

if __name__=='__main__':
 data=build();DATA.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');print({s:len(r) for s,r in data['splits'].items()})
