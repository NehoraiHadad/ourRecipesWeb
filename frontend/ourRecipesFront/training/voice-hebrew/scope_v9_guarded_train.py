"""Prospective17/73 replication of the fixed guarded-semantic V9 method.
Seed42 weights reused unchanged; actual fullcal GPU components verified.
"""
import argparse,gc,hashlib,json,time,shutil
from pathlib import Path
import torch
from corpus import ROOT,digest
from scope_v9_data import DATA
from scope_v9 import trial as train_trial,run as mechanics_run
from scope_v9_guarded import raw,route,measure,transfer
PLAN=ROOT/'verification/scope-v9-guarded-plan-20261112.json'


def evaluate_seed(folder,base,seed,parent,checkpoint,cpu_cache=None,transfer_cache=None):
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 from facts_v7_study import setup
 from scope_v8_factor_head import FactorHead
 from certainty_adapter import restore
 rows=json.loads(DATA.read_text())['splits']['calibration'];policy={'thresholds':parent['variants']['semantic-typed']['calibration']['thresholds'],'readonly_threshold':parent['variants']['semantic-global']['calibration']['threshold'],'component_floor':.95,'ordinary_threshold':.5}
 model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').to('cuda').eval();setup(model,'factor-wide');head=FactorHead().to('cuda');state=torch.load(checkpoint,weights_only=True,map_location='cuda');head.load_state_dict(state['head']);restore(model,state['adapters']);tok=AutoTokenizer.from_pretrained(base,local_files_only=True)
 torch.cuda.reset_peak_memory_stats();gp=raw(model,tok,head,[r['text'] for r in rows],'cuda');gpu=measure(rows,gp,policy);peak=torch.cuda.max_memory_allocated()
 model=model.to('cpu');head=head.to('cpu')
 cp=cpu_cache if cpu_cache is not None else raw(model,tok,head,[r['text'] for r in rows]);native=transfer_cache if transfer_cache is not None else transfer(model,tok,head,policy)
 if len(cp)!=len(gp):raise ValueError('Full calibration parity length mismatch')
 mismatch=[rows[i]['id'] for i,(a,b) in enumerate(zip(cp,gp)) if route(a,policy)!=route(b,policy)]
 delta=max(abs(a[k]-b[k]) for a,b in zip(cp,gp) for k in ('joint_confidence','ordinary_score'))
 component_delta=max(abs(x-y) for a,b in zip(cp,gp) for x,y in zip(a['components'],b['components']))
 checks={'gpu_calibration':gpu['passed'],'native_transfer_and_guard':native['passed'],'fullcal_gpu_cpu_routes':not mismatch,'component_delta':component_delta<1e-4,'minimum_updates':parent['actual_steps']>=4000,'original_backbone_invariant':parent['legacy_disabled_equal']}
 result={'seed':seed,'qualified':all(checks.values()),'checks':checks,'policy':policy,'checkpoint_sha256':digest(Path(checkpoint).read_bytes()),'parent_actual_updates':parent['actual_steps'],'parent_semantic_best_step':parent['selectors']['semantic']['step'],
 'gpu_calibration':gpu,'raw_gpu_calibration':gp,'raw_cpu_calibration':cp,'native':native,'native_from_previous_real_cpu_cache':transfer_cache is not None,'parity':{'known_examples':len(rows),'route_mismatches':mismatch,'max_joint_or_ordinary_delta':delta,'max_component_delta':component_delta},'peak_gpu_allocated_bytes':peak,'new_test_inference':False}
 folder.mkdir(exist_ok=False);shutil.copyfile(checkpoint,folder/'model.pt');(folder/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print('GUARDED_SEED',json.dumps({'seed':seed,'checks':checks,'cal_effective':gpu['metrics']['correct_effective'],'cal_corrections':gpu['metrics']['correct_corrections'],'old':native['effective'],'corrections':native['corrections_correct']}),flush=True)
 del model,head,state;gc.collect();torch.cuda.empty_cache();return result


def run(output,base,max_seconds=2100,mechanics=False):
 output=Path(output);plan=json.loads(PLAN.read_text());started=time.monotonic();torch.set_num_threads(2)
 for n,s in plan['source_sha256'].items():assert digest((ROOT/n).read_bytes())==s,n
 for n,s in plan['seed42_files'].items():assert digest((ROOT/n).read_bytes())==s,n
 assert digest(DATA.read_bytes())==plan['data_sha256']
 with (Path(base)/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==plan['body_sha256']
 if mechanics:return mechanics_run(output,base,max_seconds,True)
 if not torch.cuda.is_available():raise ValueError('Actual GPU required')
 output.mkdir(parents=True,exist_ok=False);(output/'plan.json').write_text(json.dumps(plan,indent=2)+'\n');trials=[]
 parent=json.loads((ROOT/'runs/guarded-seed42-material/parent.json').read_text());proof=json.loads((ROOT/'runs/guarded-seed42-material/feasibility.json').read_text());cache=json.loads((ROOT/'runs/guarded-seed42-material/raw-cpu.json').read_text());checkpoint=ROOT/'runs/guarded-seed42-material/model.pt'
 assert digest(checkpoint.read_bytes())==proof['checkpoint_sha256'];assert proof['calibration']['passed'] and proof['transfer']['passed']
 assert proof['policy']['thresholds']==parent['variants']['semantic-typed']['calibration']['thresholds'] and proof['policy']['readonly_threshold']==parent['variants']['semantic-global']['calibration']['threshold']
 t=evaluate_seed(output/'seed-42',base,42,parent,checkpoint,cache['raw_calibration_cpu'],proof['transfer']);trials.append(t)
 if t['qualified']:
  for seed in (17,73):
   if time.monotonic()-started>max_seconds-240:break
   parent=train_trial(output/f'parent-seed-{seed}',base,seed,started+max_seconds)
   (output/'progress.json').write_text(json.dumps({'phase':'guarded_native_and_gpu_validation','seed':seed})+'\n')
   t=evaluate_seed(output/f'seed-{seed}',base,seed,parent,output/f'parent-seed-{seed}/semantic-best.pt');trials.append(t)
   (output/'partial.json').write_text(json.dumps({'trials':trials,'qualified_for_test':False},ensure_ascii=False)+'\n')
   if not t['qualified']:break
 result={'study':'scope-v9-guarded','trials':trials,'qualified_for_test':len(trials)==3 and {t['seed'] for t in trials}=={42,17,73} and all(t['qualified'] for t in trials),'seconds':time.monotonic()-started,'seed42_retrained':False,'new_test_inference':False,'human_reviewed':False,'physical_device_tested':False}
 (output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');return result

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('output');p.add_argument('--base',required=True);p.add_argument('--max-seconds',type=int,default=2100);p.add_argument('--mechanics-only',action='store_true');a=p.parse_args();run(a.output,a.base,a.max_seconds,a.mechanics_only)
