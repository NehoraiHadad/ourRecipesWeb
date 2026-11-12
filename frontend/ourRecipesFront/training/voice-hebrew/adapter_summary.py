"""Audit real learning trajectories and draw standalone plots; no model inference."""
import csv,hashlib,json,re,zipfile
from pathlib import Path
from decimal import Decimal
from corpus import ROOT,digest


def run(root):
 root=Path(root);study=root/'recovered/study';report=json.loads((study/'result.json').read_text());manifest=json.loads((root/'archive-manifest.json').read_text())
 with (root/'results.zip').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==manifest['sha256']
 with zipfile.ZipFile(root/'results.zip') as z:assert z.testzip() is None
 plan=json.loads((ROOT/'verification/adapter-v6-plan-20261112.json').read_text())
 with zipfile.ZipFile(root/'material.zip') as z:
  for n,sha in plan['source_sha256'].items():assert digest(z.read(n))==sha,n
 curves=[];table=[]
 for trial in report['trials']:
  folder=study/f"{trial['arm']}-{trial['seed']}";points=[json.loads(l) for l in (folder/'curve.jsonl').read_text().splitlines()]
  assert [p['step'] for p in points]==sorted({p['step'] for p in points})
  prefix=max((p for p in points if p['step']<=1000),key=lambda p:tuple(p['current']['key']));all_best=max(points,key=lambda p:tuple(p['current']['key']))
  # Recompute the running winner independently from stored best-so-far.
  best=None
  for point in points:
   if best is None or tuple(point['current']['key'])>tuple(best['current']['key']):best=point
   assert point['best_step_so_far']==best['step']
  assert trial['best']['step']==best['step']
  table.append({'arm':trial['arm'],'seed':trial['seed'],'steps':trial['actual_steps'],'stop_reason':trial['stop_reason'],
   'best_up_to1000_step':prefix['step'],'best_overall_step':best['step'],'improved_selection_after1000':tuple(best['current']['key'])>tuple(prefix['current']['key']),
   'at1000':next((p for p in points if p['step']==1000),None),'final':points[-1],
   'minimum_validation_nll_step':min(points,key=lambda p:p['validation_language']['nll'])['step'],
   'interpretation':'Validation trajectories only; not proof of universal optimal duration or independent generalization.'})
  curves.append((trial,points))
 artifact=ROOT/'dist/adapter-v6-learning-curves-20261112';artifact.mkdir(exist_ok=True)
 with (artifact/'curves.csv').open('w') as f:
  w=csv.writer(f);w.writerow(['arm','seed','step','train_nll','validation_nll','current_cost','current_recall','current_false','fixed_085_recall','fixed_085_false','selected_best_step'])
  for trial,points in curves:
   for p in points:w.writerow([trial['arm'],trial['seed'],p['step'],p['train']['nll'],p['validation_language']['nll'],-p['current']['key'][1],p['current']['new']['update_recall'],p['current']['new']['false_updates'],p['fixed_0_85']['new']['update_recall'],p['fixed_0_85']['new']['false_updates'],p['best_step_so_far']])
 import matplotlib
 matplotlib.use('Agg')
 import matplotlib.pyplot as plt
 fig,ax=plt.subplots(2,2,figsize=(11,7),layout='constrained')
 for trial,points in curves:
  label=f"{trial['arm']} {trial['seed']}";x=[p['step'] for p in points];line=ax[0,0].plot(x,[p['validation_language']['nll'] for p in points],label=label)[0];color=line.get_color()
  ax[0,0].plot(x,[p['train']['nll'] for p in points],color=color,linestyle=':',alpha=.65)
  ax[0,1].plot(x,[p['fixed_0_85']['new']['update_recall'] for p in points],label=label,color=color)
  ax[1,0].plot(x,[p['fixed_0_85']['new']['false_updates'] for p in points],label=label,color=color)
  ax[1,1].plot(x,[-p['current']['key'][1] for p in points],label=label,color=color)
 for a,title in zip(ax.flat,['Cross entropy: validation solid / train dotted','Required-update recall (fixed threshold .85)','Wrong updates (fixed threshold .85)','Current validation cost (grid-calibrated threshold)']):
  a.set_title(title,fontsize=10);a.set_xlabel('Minibatch optimizer updates, batch=8');a.grid(alpha=.2);a.axvline(1000,color='gray',ls='--',alpha=.5);a.legend(fontsize=8)
 ax[0,1].set_ylim(0,1.05)
 fig.suptitle('V6 duration study — actual current checkpoints, synthetic validation',fontsize=12)
 fig.savefig(artifact/'learning-curves.png',dpi=160);fig.savefig(artifact/'learning-curves.svg');plt.close(fig)
 private=json.loads((root/'usage-private.json').read_text());balances={e['phase']:Decimal(re.search(r'Current balance:\s*([0-9.]+)',e['usage']).group(1)) for e in private if 'usage' in e}
 proof={'study':report,'curves':table,'archive_sha256_crc_verified':True,'uploaded_source_matches_freeze':True,'initial_plan':plan,
  'resources':{'reported_compute_unit_delta':float(balances['before']-balances['after_cleanup']),'driver_seconds':next(e['seconds'] for e in private if e['phase']=='finished')},
  'figure':str(artifact/'learning-curves.png'),'csv':str(artifact/'curves.csv'),'physical_device_tested':False,'human_reviewed':False,'new_test_inference':False}
 (ROOT/'verification/adapter-v6-results-20261112.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'curves':[{k:v for k,v in t.items() if k not in ('at1000','final')} for t in table],'resources':proof['resources']}));return proof


if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('root');a=p.parse_args();run(a.root)
