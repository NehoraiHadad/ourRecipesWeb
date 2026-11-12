"""Summarize the replay data ablation and its paired historical controls."""
import csv,json
from pathlib import Path
from corpus import ROOT,digest


def run():
 root=ROOT/'runs/colab-scope-v11-replay/recovered/study';d=json.loads((root/'result.json').read_text());rows=[]
 for t in d['trials']:
  cal=t['gpu_calibration'];m=cal['metrics'];native=t['native'];parent=json.loads((root/f"parent-seed-{t['seed']}/result.json").read_text())
  rows.append({'seed':t['seed'],'qualified':t['qualified'],'checks':t['checks'],'actual_updates':t['parent_actual_updates'],'selected_step':t['parent_semantic_best_step'],'checkpoint_sha256':t['checkpoint_sha256'],'calibration':{k:v for k,v in m.items() if k!='failures'},'unmeasured_reference_fallback':cal['unmeasured_reference_fallback'],'native':native,'parity':t['parity'],'trial_seconds':parent['seconds'],'peak_cuda_allocated_bytes':parent['memory_bytes'],'policy':t['policy']})
 controls=[]
 for seed,folder in ((42,'colab-scope-v9-guarded'),(17,'colab-scope-v9-guarded'),(73,'colab-scope-v10-consensus')):
  t=json.loads((ROOT/f'runs/{folder}/recovered/study/seed-{seed}/result.json').read_text());m=t['gpu_calibration']['metrics'];controls.append({'seed':seed,'qualified':t['qualified'],'calibration_effective':m['correct_effective'],'calibration_corrections':m['correct_corrections'],'calibration_false':m['false_proposals'],'unmeasured_reference_fallback':t['gpu_calibration']['unmeasured_reference_fallback'],'native':t['native']})
 import matplotlib;matplotlib.use('Agg')
 import matplotlib.pyplot as plt
 fig,axes=plt.subplots(1,2,figsize=(12,4));curves=[]
 for t in d['trials']:
  points=[json.loads(l) for l in (root/f"parent-seed-{t['seed']}/curve.jsonl").read_text().splitlines()];x=[p['step'] for p in points]
  axes[0].plot(x,[p['dev']['macro_accuracy'] for p in points],label=f"dev {t['seed']}");axes[0].plot(x,[p['train']['macro_accuracy'] for p in points],ls='--',label=f"train sample {t['seed']}")
  axes[1].plot(x,[p['dev']['nll'] for p in points],label=f"dev {t['seed']}")
  for p in points:curves.append({'seed':t['seed'],'step':p['step'],'seconds':p['seconds'],'current_dev_macro':p['dev']['macro_accuracy'],'current_dev_nll':p['dev']['nll'],'current_train_macro':p['train']['macro_accuracy'],'current_train_nll':p['train']['nll']})
 for ax,title in zip(axes,['Current accuracy, not cumulative best','Current development NLL']):ax.set_title(title);ax.set_xlabel('Minibatch updates');ax.grid(alpha=.2);ax.legend(fontsize=7)
 fig.tight_layout();out=ROOT/'dist/scope-v11-replay-learning-curves-20261112';out.mkdir(exist_ok=True);fig.savefig(out/'learning-curves.png',dpi=160);fig.savefig(out/'learning-curves.svg');plt.close(fig)
 with (out/'curves.csv').open('w') as f:w=csv.DictWriter(f,fieldnames=list(curves[0]));w.writeheader();w.writerows(curves)
 proof={'study':'scope-v11-ordinary-replay','source_commit':'a11c46f','qualified_for_test':d['qualified_for_test'],'study_seconds':d['seconds'],'trials':rows,'paired_v9_controls':controls,'new_test_inference_by_summary':False,'human_reviewed':False,'physical_device_tested':False,'limits':'Synthetic and adaptively developed; same sampler rule but replay class-size change may alter RNG stream. Separate proof controls fresh test opening.'}
 (ROOT/'verification/scope-v11-replay-results-20261112.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'qualified_for_test':proof['qualified_for_test'],'trials':[{k:v for k,v in t.items() if k not in ('policy','native','parity')} for t in rows]},ensure_ascii=False));return proof


if __name__=='__main__':run()
