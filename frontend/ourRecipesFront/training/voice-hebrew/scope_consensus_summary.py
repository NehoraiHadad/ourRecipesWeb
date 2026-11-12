"""Curate recovered trial evidence and current train/dev curves; no inference."""
import csv,json
from pathlib import Path
from corpus import ROOT,digest


def run():
 guarded=ROOT/'runs/colab-scope-v9-guarded';g=json.loads((guarded/'recovered/study/result.json').read_text())
 small=[]
 for t in g['trials']:
  small.append({k:v for k,v in t.items() if k not in ('raw_gpu_calibration','raw_cpu_calibration')})
 old={'study':'scope-v9-guarded','training_source_commit':'3b303e6','qualified_for_test':g['qualified_for_test'],'trials':small,'study_seconds':g['seconds'],'new_test_inference':False,'human_reviewed':False,'physical_device_tested':False}
 (ROOT/'verification/scope-v9-guarded-results-20261112.json').write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n')
 roots=[(42,ROOT/'runs/colab-scope-v9/recovered/study/seed-42'),(17,guarded/'recovered/study/parent-seed-17'),(73,ROOT/'runs/colab-scope-v10-consensus/recovered/study/parent-seed-73')]
 import matplotlib;matplotlib.use('Agg')
 import matplotlib.pyplot as plt
 fig,axes=plt.subplots(2,2,figsize=(12,9));table=[];curves=[]
 for seed,root in roots:
  t=json.loads((root/'result.json').read_text());points=[json.loads(l) for l in (root/'curve.jsonl').read_text().splitlines()];x=[p['step'] for p in points]
  axes[0,0].plot(x,[p['dev']['macro_accuracy'] for p in points],label=f'dev seed {seed}')
  axes[0,0].plot(x,[p['train']['macro_accuracy'] for p in points],ls='--',alpha=.5,label=f'train sample {seed}')
  axes[0,1].plot(x,[p['dev']['nll'] for p in points],label=f'dev seed {seed}')
  axes[1,0].plot(x,[p['dev_typed']['effective_recall'] for p in points],label=f'effective {seed}')
  axes[1,0].plot(x,[p['dev_typed']['correction_recall'] for p in points],ls='--',label=f'correction {seed}')
  axes[1,1].plot(x,[p['dev_typed']['false_proposals'] for p in points],label=f'seed {seed}')
  for p in points:curves.append({'seed':seed,'step':p['step'],'seconds':p['seconds'],'current_dev_macro':p['dev']['macro_accuracy'],'current_dev_nll':p['dev']['nll'],'current_train_macro':p['train']['macro_accuracy'],'current_train_nll':p['train']['nll'],'current_dev_effective':p['dev_typed']['effective_recall'],'current_dev_corrections':p['dev_typed']['correction_recall'],'current_dev_false':p['dev_typed']['false_proposals']})
  table.append({'seed':seed,'actual_updates':t['actual_steps'],'selected_step':t['selectors']['semantic']['step'],'selected_dev':t['selectors']['semantic']['dev'],'stop_reason':t['stop_reason'],'seconds_including_native_cpu':t['seconds'],'peak_cuda_allocated_bytes':t['memory_bytes'],'body_unchanged_when_adapters_disabled':t['legacy_disabled_equal']})
 for ax,title in zip(axes.flat,['Current macro accuracy (not cumulative best)','Current development attribute-product NLL','Development typed calibration coverage','Development wrong proposals']):ax.set_title(title);ax.set_xlabel('Balanced minibatch updates');ax.grid(alpha=.2);ax.legend(fontsize=7)
 fig.tight_layout();out=ROOT/'dist/scope-consensus-learning-curves-20261112';out.mkdir(exist_ok=True);fig.savefig(out/'learning-curves.png',dpi=160);fig.savefig(out/'learning-curves.svg');plt.close(fig)
 with (out/'curves.csv').open('w') as f:w=csv.DictWriter(f,fieldnames=list(curves[0]));w.writeheader();w.writerows(curves)
 devpath=ROOT/'verification/scope-v10-consensus-development-20261112.json';testpath=ROOT/'verification/scope-v10-consensus-test-20261112.json'
 proof={'method':'Fixed ALL-three consensus, single ensemble not three independent repetitions','third_member_training_source_commit':'23d6db0','members':table,'development_proof_sha256':digest(devpath.read_bytes()) if devpath.exists() else None,'test_proof_sha256':digest(testpath.read_bytes()) if testpath.exists() else None,'new_test_inference_by_summary':False,'human_reviewed':False,'physical_device_tested':False}
 (ROOT/'verification/scope-consensus-summary-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof,indent=2));return proof


if __name__=='__main__':run()
