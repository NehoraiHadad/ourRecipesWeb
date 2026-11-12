"""One isolated intervention: 480 diverse ordinary-route TRAIN replay texts.
No reference facts, original rows, or held-out split are relabelled.
"""
import collections,json,random
from corpus import ROOT,digest,load_data
from scope_v9_data import DATA as PARENT
DATA=ROOT/'verification/scope-v11-replay-data-20261112.json'


def build():
 data=json.loads(PARENT.read_text());original=list(data['splits']['train']);known={r['text']:r['label'] for r in original}
 recs,source=load_data(ROOT/'runs/state-v13-preflight/shared')
 blocked={r['text'] for s,rows in data['splits'].items() if s!='train' for r in rows}
 blocked|={r['utterance'] for r in source if r['split']!='train'}
 for name in ('validation.json','test.json'):
  p=ROOT/'verification/certainty-v5-data-20261112'/name
  if p.exists():blocked|={r['utterance'] for r in json.loads(p.read_text())['rows']}
 blocked|={r['text'] for r in json.loads((ROOT/'verification/facts-v7-replay-data-20261112.json').read_text())['splits']['test']}
 # These source rows belong to the pre-existing named-action/ordinary task,
 # not the later single generic remaining/marked reference task. OTHER means
 # delegate to that extractor, not that the user's cooking report is meaningless.
 candidates={}
 for r in source:
  if r['split']!='train' or r.get('evaluation_kind')=='state':continue
  text=r['utterance']
  if text in known or text in blocked:continue
  if 'הפעולה שנותרה' in text or 'הפעולה שסומנה' in text:raise ValueError('Reference-task text in ordinary replay source')
  candidates.setdefault(text,r)
 buckets=collections.defaultdict(list)
 for text,r in sorted(candidates.items()):buckets[r['scenario']].append(r)
 rng=random.Random(20261112)
 for rows in buckets.values():rng.shuffle(rows)
 keys=sorted(buckets);rng.shuffle(keys);selected=[]
 while len(selected)<480:
  progress=False
  for key in keys:
   if buckets[key]:selected.append(buckets[key].pop());progress=True
   if len(selected)==480:break
  if not progress:raise ValueError('Insufficient disjoint replay examples')
 additions=[{'id':f'ordinary-replay-{i}','text':r['utterance'],'label':14,'semantics':['other','other','unspecified'],'group':'ordinary-replay-'+r['id'],'source_train_row':r['id'],'source_scenario':r['scenario'],'source_recipe':r['recipe_id']} for i,r in enumerate(selected)]
 data['splits']['train']=original+additions
 data['schema']='scope-v11-ordinary-replay'
 data['ordinary_replay']={'parent_sha256':digest(PARENT.read_bytes()),'original_train':len(original),'added_train':len(additions),'ordinary_before':sum(r['label']==14 for r in original),'ordinary_after':sum(r['label']==14 for r in data['splits']['train']),'source_split':'train only','source_scenarios_selected':len({r['scenario'] for r in selected}),'candidate_distinct_after_disjointness':len(candidates),'selection':'Deterministic scenario round robin, seed20261112, fixed cap480, independent of model scores or development labels','sampling':'Same balanced15-class sampler as V9; only lexical pool changes','test_inference':False,'human_reviewed':False,'limits':'Authored synthetic source; route labels inherited from original ordinary task design, not human reviewed. Exact held texts excluded. No new reference minimal-pair augmentation in this arm.'}
 return data


if __name__=='__main__':
 d=build();DATA.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps(d['ordinary_replay'],ensure_ascii=False))
