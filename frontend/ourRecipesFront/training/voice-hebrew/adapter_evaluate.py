"""CPU verification of selected adapters; fresh480 only after all three seeds pass."""
from copy import deepcopy
from datetime import datetime,timezone
import json,hashlib,statistics,time
from pathlib import Path
from corpus import ROOT,digest,load_data
from adapter_study import BODY_SHA,features,predictions
from certainty_adapter import install,restore,disabled
from certainty_position import build_head
from certainty_train import DATA,proposals,native_baseline,compact
from certainty_contract import route
from reference_train import metrics
from span_pilot import encode,infer


def run(root):
 import torch
 from transformers import AutoModelForTokenClassification,AutoTokenizer
 root=Path(root);study=root/'recovered/study';report=json.loads((study/'result.json').read_text());torch.set_num_threads(2)
 target=root/'native-evaluation-once';target.mkdir(exist_ok=False)
 base=ROOT/'runs/colab-state-v12/recovered/ablations/control-42/run/model'
 with (base/'model.safetensors').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==BODY_SHA
 selection={'created_utc':datetime.now(timezone.utc).isoformat(),'qualified_for_fresh_test':report['qualified_for_fresh_test'],
  'evaluator_sha256':digest((ROOT/'adapter_evaluate.py').read_bytes()),'trials':[{**r,'best_sha256':digest((study/f"{r['arm']}-{r['seed']}"/'best.pt').read_bytes())} for r in report['trials']]}
 (target/'selection.json').write_text(json.dumps(selection,indent=2)+'\n')
 recs,old=load_data(ROOT/'runs/state-v13-preflight/shared');guard=[r for r in old if r['split']=='validation' and r.get('evaluation_kind')!='state'];vf=json.loads((DATA/'validation.json').read_text());recs.update({r['id']:r for r in vf['recipes']})
 sample=[guard[i*len(guard)//12] for i in range(12)]+vf['rows'][:4]
 model=AutoModelForTokenClassification.from_pretrained(base,local_files_only=True,attn_implementation='eager').eval();tok=AutoTokenizer.from_pretrained(base,local_files_only=True);install(model);model.eval()
 bt=json.loads((base.parent/'research-decision.json').read_text())['threshold'];parity=[]
 from engine import compose
 for trial in report['trials']:
  folder=study/f"{trial['arm']}-{trial['seed']}";state=torch.load(folder/'best.pt',map_location='cpu',weights_only=True)
  head=build_head();head.load_state_dict(state['head']);head.eval();restore(model,state['adapters']);expected_file=json.loads((folder/'best-validation.json').read_text());expected={c['id']:c['actual'] for k in ('new','guard') for c in expected_file[k]['cases']}
  # Control exported zero adapters, so enabled/disabled is equivalent.
  bad=[];timing=[]
  for row in sample:
   start=time.perf_counter();text=row['utterance'];label,p=predictions(head,[text],features(model,tok,[text],'cpu'))[text]
   actual=route(recs[row['recipe_id']],{'recipe_id':row['recipe_id'],**row['state']},label,p,text,trial['best']['threshold'])
   if actual is None:
    clean=deepcopy(row);clean['gold']={'intent':'clarify','changes':[]}
    with disabled(model):records=infer(model,tok,encode(tok,recs[row['recipe_id']],clean,'context-joint-v3'),'cpu')
    actual=compose(records,bt);lookup={r['action_id']:r for r in records if r['task']=='action'}
    for c in actual['changes']:c['evidence']=lookup[c['actionId']]['evidence']
   timing.append(1000*(time.perf_counter()-start))
   if actual!=expected[row['id']]:bad.append(row['id'])
  parity.append({'arm':trial['arm'],'seed':trial['seed'],'examples':16,'mismatches':bad,'median_ms':statistics.median(timing),'p95_ms':max(timing),'scope':'Known validation, actual native text path and adapter toggle,CPU2 threads,no warmup/repeats; not physical device/audio/browser'})
 (target/'parity.json').write_text(json.dumps(parity,indent=2)+'\n')
 if any(p['mismatches'] for p in parity):raise ValueError('Native parity mismatch; fresh480 remains closed')
 fresh=[]
 if report['qualified_for_fresh_test']:
  tf=json.loads((DATA/'test.json').read_text());rows=tf['rows'];rr={r['id']:r for r in tf['recipes']};texts=list(dict.fromkeys(r['utterance'] for r in rows))
  with disabled(model):baseline,meta=native_baseline(model,tok,rows,rr,'context-joint-v3',bt)
  (target/'fresh-baseline.json').write_text(json.dumps({'actual':baseline,'meta':meta},ensure_ascii=False)+'\n')
  for trial in report['trials']:
   folder=study/f"{trial['arm']}-{trial['seed']}";state=torch.load(folder/'best.pt',map_location='cpu',weights_only=True);head=build_head();head.load_state_dict(state['head']);head.eval();restore(model,state['adapters'])
   pred=predictions(head,texts,features(model,tok,texts,'cpu'));m=metrics(rows,rr,proposals(rows,rr,pred,baseline,trial['best']['threshold']))
   no_update={r['id'] for r in rows if not r['gold']['changes']};safe=sum(c['actual']['intent']=='clarify' and not c['actual']['changes'] for c in m['cases'] if c['id'] in no_update)
   fresh.append({'arm':trial['arm'],'seed':trial['seed'],'metrics':compact(m),'safe_clarifications':safe,'required_clarifications':len(no_update),'accepted':m['false_updates']==0 and m['update_recall']>=.75 and safe==len(no_update)})
   (target/f"fresh-{trial['arm']}-{trial['seed']}.json").write_text(json.dumps(m,ensure_ascii=False)+'\n')
 result={'selection':selection,'native_parity':parity,'fresh_scored':bool(fresh),'fresh':fresh,'physical_device_tested':False,'human_reviewed':False,'original120_scored':False,'scope':'Actual CPU and deterministic state code; authored correlated fixtures, not real speech'}
 (ROOT/'verification/adapter-v6-native-20261112.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));return result


if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('root');a=p.parse_args();run(a.root)
