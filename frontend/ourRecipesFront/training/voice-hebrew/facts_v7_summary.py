"""Durable current curves and compact outcomes; keep source/model quality limits."""
import argparse,csv,json
from pathlib import Path
from corpus import ROOT
from facts_v7 import DATA,JOINT,score

def run(root):
 study=Path(root)/'recovered/study';result=json.loads((study/'result.json').read_text());out=ROOT/'dist/facts-v7-learning-curves-20261112';out.mkdir(exist_ok=True)
 data=json.loads(DATA.read_text())['splits']['calibration'];review=[];groups=[]
 import matplotlib;matplotlib.use('Agg')
 import matplotlib.pyplot as plt
 fig,axes=plt.subplots(1,4,figsize=(19,4));records=[];table=[]
 native_path=ROOT/'verification/facts-v7-native-20261112.json';native=json.loads(native_path.read_text()) if native_path.exists() else None
 transfer={t['arm']:t['prior_v5_validation'] for t in native['native_vs_gpu']} if native else {}
 for t in result['trials']:
  points=[json.loads(l) for l in (study/f"{t['arm']}-42/curve.jsonl").read_text().splitlines()];x=[p['step'] for p in points]
  axes[0].plot(x,[p['macro_accuracy'] for p in points],marker='.',label=t['arm']);axes[1].plot(x,[p['policy_0_85']['effective_recall'] for p in points],marker='.')
  axes[2].plot(x,[p['policy_0_85']['false_proposals'] for p in points],marker='.')
  for p in points:records.append({k:p[k] for k in ('arm','seed','step','seconds','best_step','macro_accuracy','nll','accuracy')}|{k:p['policy_0_85'][k] for k in ('effective_recall','correction_recall','false_proposals')})
  s=t['selected'];m=s['metrics'];g=t['guard']
  for case in m['failures']:review.append({'arm':t['arm'],**case})
  for group in sorted({r['group'] for r in data}):
   indices=[i for i,r in enumerate(data) if r['group']==group];measured=score([data[i] for i in indices],[t['calibration']['predictions'][i] for i in indices],s['threshold'])
   groups.append({'arm':t['arm'],'group':group,**{k:v for k,v in measured.items() if k!='failures'}})
  table.append({'arm':t['arm'],'best_step':t['best']['step'],'actual_steps':t['actual_steps'],'threshold':s['threshold'],'dev_macro':t['best']['dev']['macro_accuracy'],'calibration_semantic_accuracy':t['calibration']['accuracy'],
   'effective_correct':m.get('correct_effective',0),'effective_required':m['expected_effective'],'correction_correct':m.get('correct_corrections',0),'correction_required':m['expected_corrections'],'false_proposals':m.get('false_proposals',0),'noop_confirmations':m.get('noop_confirmations',0),
   'guard_exact':g['exact_proposals'],'guard_false':g['false_updates'],'guard_recall':g['update_recall'],'passed':t['passed'],'seconds':t['seconds'],'gpu_peak_bytes':t['memory_bytes'],'gates':t['gates']})
 if transfer:
  labels=['V6 control']+[t['arm'] for t in result['trials']];values=[.5]+[transfer[t['arm']]['effective']['effective_update_recall'] for t in result['trials']]
  axes[3].bar(labels,values);axes[3].set_ylim(0,1);axes[3].tick_params(axis='x',labelrotation=60);axes[3].set_title('Consumed old validation: effective recall')
  for t in table:
   old=transfer[t['arm']];t['old_validation_effective_correct']=old['effective']['correct_effective_updates'];t['old_validation_corrections_correct']=old['corrections_correct'];t['old_validation_false_proposals']=old['metrics']['false_updates']
 for ax,title in zip(axes[:3],['Dev joint macro accuracy','Dev effective recall, fixed threshold .85','Dev false proposals, fixed threshold .85']):
  ax.set(title=title,xlabel='Balanced minibatch updates');ax.grid(alpha=.25)
 axes[0].legend(fontsize=8);fig.tight_layout();fig.savefig(out/'learning-curves.png',dpi=160);fig.savefig(out/'learning-curves.svg');plt.close(fig)
 with (out/'curves.csv').open('w') as f:
  w=csv.DictWriter(f,fieldnames=list(records[0]));w.writeheader();w.writerows(records)
 (out/'calibration-failures.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n')
 (out/'calibration-by-group.json').write_text(json.dumps(groups,ensure_ascii=False,indent=2)+'\n')
 proof={'study':'facts-v7','trials':table,'training_gpu_seconds':result['seconds'],'new_test_inference':False,'physical_device_tested':False,'human_reviewed':False,'effective_unit':'Counterfactual cases: two unique states per text; not independent natural utterances'}
 (ROOT/'verification/facts-v7-results-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof,indent=2));return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');a=p.parse_args();run(a.root)
