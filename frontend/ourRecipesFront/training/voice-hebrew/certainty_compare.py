"""Post-selection comparison to fixed R4 on new validation; never selects weights."""
import json
from pathlib import Path
from corpus import ROOT,digest
from certainty_train import BASE,DATA,compact
from reference_train import features,build_head,predicts,actuals,metrics


def run(folder):
    import torch
    from transformers import AutoModelForTokenClassification,AutoTokenizer
    torch.set_num_threads(2);folder=Path(folder)
    # Require completed frozen selection before any comparative diagnosis.
    selected=json.loads((folder/'evaluation-once/selection.json').read_text())
    data=json.loads((DATA/'validation.json').read_text());rows=data['rows'];recs={r['id']:r for r in data['recipes']}
    baseline=json.loads((folder/'native-baseline.json').read_text())['validation']
    prior=ROOT/'runs/reference-head-cpu-r4';prior_plan=json.loads((ROOT/'verification/reference-scope-selection-20261112.json').read_text())
    assert prior_plan['body_sha256']==selected['body_sha256']
    model=AutoModelForTokenClassification.from_pretrained(BASE/'model',local_files_only=True,attn_implementation='eager').eval();tok=AutoTokenizer.from_pretrained(BASE/'model',local_files_only=True)
    for p in model.parameters():p.requires_grad_(False)
    texts=list(dict.fromkeys(r['utterance'] for r in rows));x=features(model,tok,texts);trials=[]
    for v in prior_plan['variants']:
        seed=v['seed'];path=prior/f'head-{seed}.pt';assert digest(path.read_bytes())==v['head_sha256']
        head=build_head();head.load_state_dict(torch.load(path,weights_only=True));head.eval();pred=predicts(head,texts,x)
        m=metrics(rows,recs,actuals(rows,recs,pred,baseline,v['threshold']))
        trials.append({'seed':seed,'threshold':v['threshold'],'metrics':compact(m),'by_scenario':m['by_scenario']})
    current=[]
    labels={r['text']:r['label'] for r in json.loads((DATA/'language.json').read_text())['validation']}
    for v in selected['variants']:
        report=json.loads((folder/f"validation-{v['seed']}.json").read_text());pred=report['predictions']
        current.append({'seed':v['seed'],'threshold':v['threshold'],'metrics':compact(report['new']),'by_scenario':report['new']['by_scenario'],
            'raw_semantic_labels_correct':sum(pred[t][0]==label for t,label in labels.items()),'unique_language_texts':len(labels),
            'role':'Diagnostic pre-threshold label accuracy only; not independent holdout or selection objective'})
    proof={'scope':'New validation, post-selection comparison to fixed prior R4; current study changes data, class structure and routing jointly, not a causal ablation.',
        'prior_fixed_r4':trials,'selected_v5':current,'new_test_inference':False}
    (ROOT/f"verification/{json.loads((folder/'result.json').read_text())['plan']['study']}-comparison-20261112.json").write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps(proof));return proof


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('folder');a=p.parse_args();run(a.folder)
