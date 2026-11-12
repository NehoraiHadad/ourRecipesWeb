"""V9 current train/dev curves plus all frozen policy outcomes, no inference."""
import argparse,csv,json
from pathlib import Path
from corpus import ROOT

def run(root):
 study=Path(root)/'recovered/study';r=json.loads((study/'result.json').read_text());table=[];curves=[]
 import matplotlib;matplotlib.use('Agg')
 import matplotlib.pyplot as plt
 fig,axes=plt.subplots(2,2,figsize=(13,9))
 for t in r['trials']:
  points=[json.loads(l) for l in (study/f"seed-{t['seed']}/curve.jsonl").read_text().splitlines()];x=[p['step'] for p in points]
  axes[0,0].plot(x,[p['dev']['macro_accuracy'] for p in points],label=f"dev {t['seed']}");axes[0,0].plot(x,[p['train']['macro_accuracy'] for p in points],ls='--',label=f"train sample {t['seed']}")
  axes[0,1].plot(x,[p['dev']['nll'] for p in points],label=f"dev {t['seed']}");axes[0,1].plot(x,[p['train']['nll'] for p in points],ls='--',label=f"train sample {t['seed']}")
  for p in points:curves.append({'seed':t['seed'],'step':p['step'],'seconds':p['seconds'],'train_macro':p['train']['macro_accuracy'],'train_nll':p['train']['nll'],'dev_macro':p['dev']['macro_accuracy'],'dev_nll':p['dev']['nll'],'dev_effective':p['dev_typed']['effective_recall'],'dev_correction':p['dev_typed']['correction_recall'],'dev_false':p['dev_typed']['false_proposals'],'semantic_best':p['best_steps']['semantic'],'safety_best':p['best_steps']['safety']})
  for method,v in t['variants'].items():
   cal=v['calibration'];m=cal['metrics'];old=v['transfer'];table.append({'seed':t['seed'],'method':method,'best_step':v['best']['step'],'actual_steps':t['actual_steps'],'stop_reason':t['stop_reason'],'qualified':v['qualified'],'checks':v['checks'],
    'calibration':{k:value for k,value in m.items() if k!='failures'},'threshold':cal.get('threshold'),'thresholds':cal.get('thresholds'),'unmeasured_reference_fallback':cal['unmeasured_reference_fallback'],
    'old_consumed_validation':old['effective'],'old_corrections':old['corrections_correct'],'old_false_proposals':old['old']['false_updates'],'guard':old['guard'],'native_calibration_examples':v['native_calibration_examples'],'native_mismatches':v['native_gate_mismatches'],'trial_seconds_including_cpu':t['seconds'],'peak_cuda_allocated_bytes':t['memory_bytes']})
 method=r['selected_method'] or 'safety-typed';selected=[t for t in table if t['method']==method];labels=['V7 replay','V8 factor']+[f"V9 {v['seed']}" for v in selected];x=list(range(len(labels)))
 axes[1,0].bar([i-.18 for i in x],[.75,26/32]+[v['old_consumed_validation']['effective_update_recall'] for v in selected],width=.36,label='Effective recall')
 axes[1,0].bar([i+.18 for i in x],[.5,14/16]+[v['old_corrections']/16 for v in selected],width=.36,label='Correction recall');axes[1,0].set_xticks(x,labels);axes[1,0].set_ylim(0,1);axes[1,0].legend(fontsize=8)
 axes[1,1].bar([i-.18 for i in x],[5,0]+[v['old_false_proposals'] for v in selected],width=.36,label='Wrong proposals')
 axes[1,1].bar([i+.18 for i in x],[2,0]+[v['old_consumed_validation']['wrong_effective_updates'] for v in selected],width=.36,label='Wrong actual changes');axes[1,1].set_xticks(x,labels);axes[1,1].legend(fontsize=8)
 for ax,title in zip(axes.flat,['Current joint macro accuracy','Current attribute-product NLL',f'Consumed V5 coverage: {method}',f'Consumed V5 errors: {method}']):ax.set_title(title);ax.grid(alpha=.2)
 for ax in axes[0]:ax.set_xlabel('Balanced minibatch updates');ax.legend(fontsize=7)
 fig.tight_layout();out=ROOT/'dist/scope-v9-learning-curves-20261112';out.mkdir(exist_ok=True);fig.savefig(out/'learning-curves.png',dpi=160);fig.savefig(out/'learning-curves.svg');plt.close(fig)
 with (out/'curves.csv').open('w') as f:w=csv.DictWriter(f,fieldnames=list(curves[0]));w.writeheader();w.writerows(curves)
 proof={'study':'scope-v9','training_source_commit':'bd1d88f','selected_method':r['selected_method'],'qualified_for_test':r['qualified_for_test'],'eligible_methods':r['eligible_methods'],'trials':table,'study_seconds_including_cpu':r['seconds'],
 'new_test_inference':False,'human_reviewed':False,'physical_device_tested':False,'note':'Synthetic development/consumed transfer outcomes only. All4 selectors/policies reported; priority diagnostic plotted if none qualifies. Separate proof governs any later fresh test.'}
 (ROOT/'verification/scope-v9-results-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof,indent=2));return proof

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root');a=p.parse_args();run(a.root)
