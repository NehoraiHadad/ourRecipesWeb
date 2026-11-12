"""Read-only audit of consumed data and recorded classification scores.
A continuous calibration upper bound diagnoses the old coarse grid; it is not
an independently validated operating policy or evidence of fresh test success.
"""
import hashlib,json,math
from collections import Counter,defaultdict
from pathlib import Path
from corpus import ROOT,digest
from scope_v13_stance import metrics
DATA=ROOT/'verification/scope-v13-stance-data-20261112.json'


def continuous_safe_cut(rows,probabilities):
 if len(rows)!=len(probabilities) or not rows:raise ValueError('Unaligned or empty audit inputs')
 if any(not math.isfinite(p) or not 0<=p<=1 for p in probabilities):raise ValueError('Invalid recorded probability')
 negatives=[p for r,p in zip(rows,probabilities) if not r['allow']]
 if not negatives:raise ValueError('No negative examples for safety audit')
 threshold=math.nextafter(max(negatives),math.inf)
 return {'threshold_float64':threshold,'max_negative_score':max(negatives),'metrics':metrics(rows,probabilities,threshold),'scope':'Optimistic in-sample calibration-only coverage with zero observed false allowances. No numerical margin,device stability,independence or universal safety claim.'}


def groups(rows,probabilities,threshold):
 result={}
 for field in ('operator_family','status','reference','commitment'):
  buckets=defaultdict(list)
  for row,p in zip(rows,probabilities):
   key=row.get('operator_family') if field=='operator_family' else row['semantics'][{'reference':0,'commitment':1,'status':2}[field]]
   buckets[key].append((row,p))
  result[field]={key:metrics([x[0] for x in values],[x[1] for x in values],threshold) for key,values in buckets.items()}
 return result


def run():
 document=json.loads(DATA.read_text());data=document['splits'];assert digest(DATA.read_bytes())=='33cb4af1be1b5da20b2359d0444c3fbf44c638e9d959633f20686e0ca24d0f02'
 evidence={};sources={}
 def load(path):
  path=ROOT/path;sources[str(path.relative_to(ROOT))]=digest(path.read_bytes());return json.loads(path.read_text())
 training=load('runs/scope-v13-stance/training.json')
 for t in training['trials']:
  p=t['calibration_probabilities'];key='v13-'+t['arm'];cut=t['calibration']['threshold'];evidence[key]={'original_policy':t['calibration'],'continuous_calibration_upper_bound':continuous_safe_cut(data['calibration'],p),'groups_at_original_threshold':groups(data['calibration'],p,cut)}
 trial=load('runs/colab-scope-v14-stance/recovered/study/result.json')['trials'][0];p=trial['gpu_calibration_probabilities'];evidence['v14']={'original_policy':trial['calibration'],'continuous_calibration_upper_bound':continuous_safe_cut(data['calibration'],p),'groups_at_original_threshold':groups(data['calibration'],p,trial['calibration']['threshold'])}
 for number in (15,16,17):
  kind='capacity' if number==17 else 'teacher';folder=f'runs/colab-scope-v{number}-{kind}/recovered/study'
  if not (ROOT/folder/'result.json').exists():continue
  result=load(folder+'/result.json');cut=result['calibration']['threshold'];evidence['v'+str(number)]={'original_policy':result['calibration'],'sets':{}}
  for split in ('dev','calibration'):
   raw=load(folder+'/'+('dev' if split=='dev' and number!=17 else split)+'-raw.json');by_id={r['id']:r for r in raw['records']};rows=data[split];assert set(by_id)=={r['id'] for r in rows}
   p=[by_id[r['id']]['allow_score'] for r in rows];evidence['v'+str(number)]['sets'][split]={'metrics':metrics(rows,p,cut),'groups':groups(rows,p,cut),'continuous_in_sample_bound':continuous_safe_cut(rows,p)}
 shapes={};texts=set();conflicts=[]
 for split in ('train','dev','calibration'):
  rows=data[split];shapes[split]={'rows':len(rows),'labels':dict(Counter(r['allow'] for r in rows)),'new_operator_families':sorted({r['operator_family'] for r in rows if r['source']=='new_authored_contrast'}),'new_predicate_families':sorted({r['predicate_family'] for r in rows if r['source']=='new_authored_contrast'}),'asserted_partial_rows':sum(r['allow']==1 and r['semantics'][2]=='partial' for r in rows)}
  for r in rows:
   if r['allow']!=int(r['semantics'][1]=='asserted'):conflicts.append(r['id'])
   assert r['text'] not in texts;texts.add(r['text'])
 assert not conflicts
 proof={'data_sha256':digest(DATA.read_bytes()),'source_sha256':sources,'fresh_sets_inferred':False,'human_reviewed':False,'data_shapes':shapes,'label_semantics_conflicts':conflicts,'evidence':evidence,'methodological_findings':['Original train/dev/calibration simultaneously change operator family and action-predicate vocabulary;existing failures alone do not identify which factor caused them.','A definite partial or incomplete report is asserted,not a completed action. Keep commitment and completion outputs separate.','Zero observed errors across96 authored negatives is not zero deployment risk;templates are correlated and are not96 independent user conversations.','V13/V14 upper-tail probabilities exceed0.99;the original fixed grid can discard useful coverage. Preserve frozen outcomes and label continuous recalibration as retrospective diagnostic.','The current classifier addresses one generic reference;it does not yet solve scope over multiple named actions or full recipe state.','Train family not_denying has a pragmatic boundary:absence of denial need not entail a direct factual report. Flag for label review before training;do not silently relabel validation.'],'next_control':'Use a factorial development probe with operator family seen/unseen crossed with predicate seen/unseen,plus named-action scope contrasts. Freeze probe before inference and keep all known tests closed.'}
 out=ROOT/'verification/scope-v17-measurement-audit-20261112.json';out.write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v['continuous_calibration_upper_bound']['metrics'] for k,v in evidence.items() if 'continuous_calibration_upper_bound' in v}));return proof


if __name__=='__main__':run()
