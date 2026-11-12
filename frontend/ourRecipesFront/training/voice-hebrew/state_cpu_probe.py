"""Native-only, fixed-threshold validation stress score; never model selection."""
import argparse
import json
from pathlib import Path
from corpus import ROOT,digest
from span_pilot import encode,infer,grounded


def run(folder,output):
    import torch
    from transformers import AutoTokenizer,AutoModelForTokenClassification
    torch.set_num_threads(2);folder=Path(folder)
    fixture=ROOT/'verification/state-v12-invariance-fixtures-20261112.json';plan=json.loads((ROOT/'verification/state-v12-invariance-plan-20261112.json').read_text())
    if digest(fixture.read_bytes())!=plan['fixtures_sha256']:raise ValueError('Stress fixtures changed')
    data=json.loads(fixture.read_text());recs={r['id']:r for r in data['recipes']};rows=data['rows']
    cfg=json.loads((folder/'run-config.json').read_text());threshold=json.loads((folder/'research-decision.json').read_text())['threshold']
    tok=AutoTokenizer.from_pretrained(folder/'model',local_files_only=True)
    model=AutoModelForTokenClassification.from_pretrained(folder/'model',local_files_only=True,attn_implementation='eager').eval()
    items=[i for row in rows for i in encode(tok,recs[row['recipe_id']],row,cfg['span_profile'])]
    metrics=grounded(rows,infer(model,tok,items,'cpu'),threshold)
    result={'scope':'Separate predeclared validation invariance diagnostic on32 authored cases; actual native CPU inference, no tuning/new-test inference or independent natural-speech acceptance',
        'fixtures_sha256':plan['fixtures_sha256'],'metrics':metrics,'physical_device_tested':False}
    Path(output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    return {k:v for k,v in metrics.items() if k not in ('cases','by_scenario')}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('run');p.add_argument('output');a=p.parse_args();print(json.dumps(run(a.run,a.output)))
