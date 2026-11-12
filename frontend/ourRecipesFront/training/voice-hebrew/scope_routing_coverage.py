"""Development coverage/route diagnostic; no training or sealed-test inference."""
import collections,json
from corpus import ROOT,load_data,digest
from scope_v9_data import DATA
from scope_v9_guarded import route


def run():
 data=json.loads(DATA.read_text());train=data['splits']['train'];counts=collections.Counter(r['label'] for r in train)
 proofpath=ROOT/'verification/scope-v10-consensus-feasibility-20261112.json';proof=json.loads(proofpath.read_text());cache=proof['raw_native'];lookup={t:i for i,t in enumerate(cache['texts'])}
 study=ROOT/'runs/colab-scope-v9-guarded/recovered/study';members=[json.loads((study/f'seed-{s}/result.json').read_text()) for s in (42,17)];policies=[m['policy'] for m in members]
 recs,rows=load_data(ROOT/'runs/state-v13-preflight/shared');guard=[r for r in rows if r['split']=='validation' and r.get('evaluation_kind')!='state'];differences=[]
 for r in guard:
  i=lookup[r['utterance']];votes=[route(c[i],p) for c,p in zip(cache['members'],policies)]
  if votes[0]!=votes[1]:differences.append({'id':r['id'],'text':r['utterance'],'votes':votes,'raw':[c[i] for c in cache['members']]})
 ordinary=[r for r in train if r['label']==14]
 out={'scope':'Post-outcome training-coverage/consumed routing diagnostic. Does not create labels, train weights, change decoder, or infer any sealed test.','data_sha256':digest(DATA.read_bytes()),'real_cpu_cache_sha256':digest(proofpath.read_bytes()),'training_rows':len(train),'class_counts':dict(counts),'ordinary_distinct_texts':len({r['text'] for r in ordinary}),'ordinary_fraction_of_unique_training_rows':len(ordinary)/len(train),'sampler_expected_fraction_for_ordinary':1/15,'important_distinction':'Balanced class sampling prevents simple frequency imbalance. Only120 ordinary text types still limit linguistic diversity; this is a hypothesis, not a demonstrated causal effect.','guard_route_disagreements':differences,'future_data_intervention':'If retraining is needed, compare unchanged V9 vs train-only ordinary-route replay and independent reference minimal-pair augmentation as separate arms. Audit route labels first, freeze data/selector/budget before inference, and use a NEW independent evaluation set after any consumed test failure. Do not train on development or test failures then report those as independent quality.','test_inference':False,'human_reviewed':False}
 (ROOT/'verification/scope-routing-coverage-20261112.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k!='guard_route_disagreements'},ensure_ascii=False));print('guard_route_disagreements',len(differences));return out


if __name__=='__main__':run()
