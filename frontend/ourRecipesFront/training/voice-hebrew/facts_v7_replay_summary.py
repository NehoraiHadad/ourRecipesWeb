"""Read frozen replay outcome; no inference, tuning or test opening."""
import argparse,csv,json
from pathlib import Path
from corpus import ROOT,digest

def run(root):
 root=Path(root);study=root/'recovered/study';result=json.loads((study/'result.json').read_text());t=result['trials'][0];old=t['native']['old_validation'];m=t['selected']['metrics']
 proof={'study':'facts-v7-replay','seed':42,'source_commit':'9b44175','training_texts':1252,'train_only_added_texts':556,'actual_steps':t['actual_steps'],'best_step':t['best']['step'],'threshold':t['selected']['threshold'],
 'new_calibration':{k:v for k,v in m.items() if k!='failures'},'calibration_semantic_accuracy':t['calibration']['accuracy'],'old_consumed_validation_effective':old['effective'],'old_corrections_correct':old['corrections_correct'],'old_corrections_required':16,
 'old_wrong_proposals':old['metrics']['false_updates'],'guard':t['guard'],'transfer_checks':t['transfer_checks'],'qualified_for_test':result['qualified_for_test'],'seeds_expanded':False,'trial_seconds':t['seconds'],'study_seconds_including_native_cpu':result['seconds'],
 'peak_cuda_allocated_bytes':t['memory_bytes'],'cpu_gpu_known_calibration_parity':{k:v for k,v in t['native'].items() if k!='old_validation'},'checkpoint_sha256':digest((study/'flat-narrow-42/best.pt').read_bytes()),
 'new_test_inference':False,'human_reviewed':False,'physical_device_tested':False,'note':'Synthetic development data, repeated state cases. Same consumed old validation used for additional transfer gate, not an independent test.'}
 out=ROOT/'dist/facts-v7-replay-learning-curves-20261112';out.mkdir(exist_ok=True);points=[json.loads(l) for l in (study/'flat-narrow-42/curve.jsonl').read_text().splitlines()]
 import matplotlib;matplotlib.use('Agg')
 import matplotlib.pyplot as plt
 fig,axes=plt.subplots(1,3,figsize=(14,4));axes[0].plot([p['step'] for p in points],[p['macro_accuracy'] for p in points],marker='.');axes[0].set(title='Replay: current dev joint macro accuracy',xlabel='Balanced minibatch updates',ylim=(0,1));axes[0].grid(alpha=.2)
 labels=['V6 control','V7 new-only','V7 replay'];x=list(range(3));axes[1].bar([v-.18 for v in x],[16/32,4/32,24/32],width=.36,label='Effective recall');axes[1].bar([v+.18 for v in x],[0,0,8/16],width=.36,label='Correction recall');axes[1].set_xticks(x,labels);axes[1].set(title='Same consumed old validation',ylim=(0,1));axes[1].legend(fontsize=8)
 axes[2].bar([v-.18 for v in x],[0,9,5],width=.36,label='Wrong proposals');axes[2].bar([v+.18 for v in x],[0,0,2],width=.36,label='Wrong actual changes');axes[2].set_xticks(x,labels);axes[2].set_title('Errors cannot be hidden by higher recall');axes[2].legend(fontsize=8)
 fig.tight_layout();fig.savefig(out/'learning-curves.png',dpi=160);fig.savefig(out/'learning-curves.svg');plt.close(fig)
 records=[{k:p[k] for k in ('step','seconds','best_step','macro_accuracy','nll','accuracy')}|{k:p['policy_0_85'][k] for k in ('effective_recall','correction_recall','false_proposals')} for p in points]
 with (out/'curves.csv').open('w') as f:w=csv.DictWriter(f,fieldnames=list(records[0]));w.writeheader();w.writerows(records)
 (ROOT/'verification/facts-v7-replay-results-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof,indent=2));return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');a=p.parse_args();run(a.root)
