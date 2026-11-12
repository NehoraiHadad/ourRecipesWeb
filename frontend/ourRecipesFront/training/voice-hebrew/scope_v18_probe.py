"""Factorial development diagnosis; never a new held quality test or training.
Cross known training/calibration operators with known training/calibration predicates.
Restores existing frozen checkpoints and scores them on CPU without changing files.
"""
import argparse,json,time
from collections import Counter
from pathlib import Path
from corpus import ROOT,digest
from facts_v7 import ROOTS
from scope_v13_data import OPERATORS
from scope_v13_stance import StanceHead,probabilities,metrics
DATA=ROOT/'verification/scope-v18-factorial-data-20261112.json'
PLAN=ROOT/'verification/scope-v18-factorial-plan-20261112.json'
TRAIN_FAMILIES=('checked_guess','guess_denial','unrelated_prefix','suffix')
CAL_FAMILIES=('commit','imaginary','suffix_verify','weather_scope')


def build():
 known=json.loads((ROOT/'verification/scope-v13-stance-data-20261112.json').read_text())['splits'];lookup={r['text']:split for split,rows in known.items() for r in rows};rows=[]
 for axis,names,split in (('training_operator',TRAIN_FAMILIES,'train'),('calibration_operator',CAL_FAMILIES,'calibration')):
  operators={r[0]:r for r in OPERATORS[split]}
  for family in names:
   _,positive,negative,denied=operators[family]
   for predicate_axis,predicates in (('training_predicate',(0,1)),('calibration_predicate',(6,7))):
    for predicate in predicates:
     for reference,subject in (('remaining','הפעולה שנותרה'),('marked','הפעולה שסומנה כמושלמת')):
      for status,word in zip(('complete','incomplete','partial'),ROOTS[predicate]):
       for operator,commit in ((positive,'asserted'),(negative,denied)):
        text=operator.format(c=subject+' '+word);rows.append({'id':f'factorial-{len(rows)}','text':text,'allow':int(commit=='asserted'),'semantics':[reference,commit,'unspecified' if commit=='nonassertion' else status],'content_status':status,'operator_family':family,'operator_axis':axis,'predicate_axis':predicate_axis,'predicate_family':predicate,'existing_full_text_split':lookup.get(text),'cell':axis+' / '+predicate_axis})
 assert len(rows)==384 and len({r['text'] for r in rows})==384
 assert not any(r['existing_full_text_split'] in ('test','natural_test') for r in rows)
 return {'scope':'Development-only factorial diagnosis. Known training/calibration material plus crossed recombinations,not independent new test. No existing held set inference.','human_reviewed':False,'training_performed':False,'cells':dict(Counter(r['cell'] for r in rows)),'rows':rows}


def run(output):
 import torch
 from scope_v13_features import load_encoder
 from adapter_study import features
 from certainty_adapter import restore
 torch.set_num_threads(2);plan=json.loads(PLAN.read_text())
 for name,sha in {**plan['source_sha256'],**plan['input_sha256']}.items():assert digest((ROOT/name).read_bytes())==sha,name
 assert digest(DATA.read_bytes())==plan['data_sha256']
 output=Path(output);output.mkdir(exist_ok=False);rows=json.loads(DATA.read_text())['rows'];texts=[r['text'] for r in rows];start=time.monotonic();model,tok,_=load_encoder();results={}
 for spec in plan['models']:
  state=torch.load(ROOT/spec['checkpoint'],map_location='cpu',weights_only=True)
  if 'adapters' in state:restore(model,state['adapters'])
  head=StanceHead(spec['head']);head.load_state_dict(state['head']);p=probabilities(head,features(model,tok,texts,'cpu'));cells={}
  for cell in sorted({r['cell'] for r in rows}):
   indices=[i for i,r in enumerate(rows) if r['cell']==cell];sub=[rows[i] for i in indices];ps=[p[i] for i in indices];m=metrics(sub,ps,.5);m['classification_accuracy_at_half']=sum((v>=.5)==bool(r['allow']) for r,v in zip(sub,ps))/len(sub)
   cells[cell]={'at_half':m,'at_original_frozen_cut':metrics(sub,ps,spec['original_cut']),'at_retrospective_calibration_cut':metrics(sub,ps,spec['retrospective_calibration_cut'])}
  results[spec['name']]={'checkpoint_sha256':plan['input_sha256'][spec['checkpoint']],'probabilities':p,'cells':cells}
  (output/'progress.json').write_text(json.dumps({'completed_model':spec['name'],'seconds':time.monotonic()-start})+'\n')
 proof={'data_sha256':plan['data_sha256'],'models':results,'seconds':time.monotonic()-start,'device':'actual CPU','torch':torch.__version__,'fresh_sets_inferred':False,'training_performed':False,'human_reviewed':False,'recorded_speech':False,'physical_device_tested':False,'thresholds_selected_on_probe':False,'scope':'Standalone commitment-only development diagnosis,not full recipe pipeline or deployment validation. Tail cuts derived from old GPU calibration may be numerically brittle on CPU.'}
 (output/'result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps({n:v['cells'] for n,v in results.items()},ensure_ascii=False));return proof


if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--prepare',action='store_true');parser.add_argument('--output');args=parser.parse_args()
 if args.prepare:DATA.write_text(json.dumps(build(),ensure_ascii=False,indent=2)+'\n')
 else:run(args.output)
