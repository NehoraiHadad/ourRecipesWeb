"""Compact frozen-scope outcomes and current curves; no model inference."""
import argparse,csv,json
from pathlib import Path
from corpus import ROOT
from scope_v8_data import DATA
from facts_v7 import score

def run(root):
 root=Path(root);study=root/'recovered/study';result=json.loads((study/'result.json').read_text());rows=json.loads(DATA.read_text())['splits']['calibration'];table=[];curves=[]
 import matplotlib;matplotlib.use('Agg')
 import matplotlib.pyplot as plt
 fig,axes=plt.subplots(2,2,figsize=(13,9))
 for t in result['trials']:
  name=t['run_name'];folder=study/name;points=[json.loads(l) for l in (folder/'curve.jsonl').read_text().splitlines()]
  axes[0,0].plot([p['step'] for p in points],[p['macro_accuracy'] for p in points],marker='.',label=name)
  axes[0,1].plot([p['step'] for p in points],[p['nll'] for p in points],marker='.',label=name)
  for p in points:curves.append({k:p[k] for k in ('arm','seed','step','seconds','best_step','macro_accuracy','nll','accuracy')}|{k:p['policy_0_85'][k] for k in ('effective_recall','correction_recall','false_proposals')})
  native=t['native'];old=native['old_validation'];m=t['selected']['metrics'];subsets={}
  for subset in ('new_scope','retained'):
   indices=[i for i,r in enumerate(rows) if bool(r.get('new_scope'))==(subset=='new_scope')];s=score([rows[i] for i in indices],[t['calibration']['predictions'][i] for i in indices],t['selected']['threshold'])
   subsets[subset]={k:v for k,v in s.items() if k!='failures'}
  table.append({'foundation':t['foundation'],'run_name':t['run_name'],'arm':t['arm'],'seed':t['seed'],'best_step':t['best']['step'],'actual_steps':t['actual_steps'],'threshold':t['selected']['threshold'],'dev_macro_accuracy':t['best']['dev']['macro_accuracy'],
   'calibration_semantic_accuracy':t['calibration']['accuracy'],'calibration':{k:v for k,v in m.items() if k!='failures'},'calibration_subsets':subsets,'old_consumed_validation':old['effective'],'old_corrections_correct':old['corrections_correct'],'old_corrections_required':16,
   'old_false_proposals':old['metrics']['false_updates'],'guard':t['guard'],'qualified':t['qualified'],'qualification_checks':t['qualification_checks'],'native_calibration_examples':native['known_calibration_examples'],
   'native_decision_mismatches':native['cpu_gpu_decision_mismatches'],'trial_seconds':t['seconds'],'peak_cuda_allocated_bytes':t['memory_bytes'],'new_test_inference':False})
 labels=['V6 control','V7 replay']+[f"{t['foundation']}\n{t['seed']}" for t in table];x=list(range(len(labels)))
 axes[1,0].bar([v-.18 for v in x],[.5,.75]+[t['old_consumed_validation']['effective_update_recall'] for t in table],width=.36,label='Effective recall')
 axes[1,0].bar([v+.18 for v in x],[0,.5]+[t['old_corrections_correct']/16 for t in table],width=.36,label='Correction recall');axes[1,0].set_xticks(x,labels);axes[1,0].set_ylim(0,1);axes[1,0].legend(fontsize=8)
 axes[1,1].bar([v-.18 for v in x],[0,5]+[t['old_false_proposals'] for t in table],width=.36,label='Wrong proposals')
 axes[1,1].bar([v+.18 for v in x],[0,2]+[t['old_consumed_validation']['wrong_effective_updates'] for t in table],width=.36,label='Wrong actual changes');axes[1,1].set_xticks(x,labels);axes[1,1].legend(fontsize=8)
 for ax,title in zip(axes.flat,['Current dev joint macro accuracy','Current dev joint NLL','Consumed V5 validation: coverage','Consumed V5 validation: errors']):ax.set_title(title);ax.grid(alpha=.2)
 for ax in axes[0]:ax.set_xlabel('Balanced minibatch updates');ax.legend(fontsize=8)
 for ax in axes[1]:ax.tick_params(axis='x',labelrotation=35)
 fig.tight_layout();out=ROOT/'dist/scope-v8-factor-learning-curves-20261112';out.mkdir(exist_ok=True);fig.savefig(out/'learning-curves.png',dpi=160);fig.savefig(out/'learning-curves.svg');plt.close(fig)
 with (out/'curves.csv').open('w') as f:w=csv.DictWriter(f,fieldnames=list(curves[0]));w.writeheader();w.writerows(curves)
 proof={'study':'scope-v8-factor','source_commit':'4c8657a','selected_method':result['selected_method'],'selected_foundation':result['selected_foundation'],'public_control':result['public_control'],'qualified_for_test':result['qualified_for_test'],'trials':table,'study_seconds_including_native_cpu':result['seconds'],
 'new_test_inference':False,'physical_device_tested':False,'human_reviewed':False,'note':'All language synthetic, repeated state cases. Old V5 validation is consumed development guard, not independent test. See separate test proof if subsequently opened.'}
 (ROOT/'verification/scope-v8-factor-results-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof,indent=2));return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');a=p.parse_args();run(a.root)
