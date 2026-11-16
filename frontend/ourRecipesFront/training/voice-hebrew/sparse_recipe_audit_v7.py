"""Recompute diagnostic scores; numerical vector comparisons are instrumented metadata."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile
from sparse_recipe_v3 import aggregate

ROOT=Path(__file__).resolve().parent


def sha(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def audit(run):
    run=Path(run);plan=json.loads((ROOT/'verification/sparse-recipe-plan-v7-20261116.json').read_text())
    for name,expected in {**plan['source_sha256'],**plan['artifact_sha256']}.items():assert sha(ROOT/name)==expected,name
    data=json.loads((ROOT/plan['data_file']).read_text());outer=json.loads((run/'archive-manifest.json').read_text())
    archive=run/'results.zip';assert sha(archive)==outer['sha256'] and archive.stat().st_size==outer['bytes']
    with zipfile.ZipFile(archive) as src:
        assert src.testzip() is None
        manifest=json.loads(src.read('MANIFEST.json'));assert set(src.namelist())==set(manifest)|{'MANIFEST.json'}
        for name,meta in manifest.items():
            assert not Path(name).is_absolute() and '..' not in Path(name).parts
            raw=src.read(name);assert len(raw)==meta['bytes'] and hashlib.sha256(raw).hexdigest()==meta['sha256'],name
        load=lambda n:json.loads(src.read(n))
        status=load('status.json');assert status['status']=='complete'
        saved=load('study/result.json');metrics={};plain=[]
        for route in plan['routes']:
            raw=load('study/'+route+'.json');rows=data['plain'] if route=='plain' else data['language']
            records=raw['records'];assert [r['id'] for r in records]==[r['id'] for r in rows]
            limit=24 if route=='plain' else 96
            assert all(len(r['tokens'])<=limit and r['prompt_tokens']+limit<=1024 for r in records)
            if route=='plain':
                assert raw['metrics'] is None
                plain=[{'id':r['id'],'utterance':row['utterance'],'expected_text':row['expected_text'],
                    'actual_text':r['text'],'strict_trimmed_match':r['text'].strip()==row['expected_text'],'hit_limit':r['hit_limit']} for row,r in zip(rows,records)]
            else:
                metrics[route]=aggregate(rows,[r['text'] for r in records])[0]
                assert metrics[route]==raw['metrics']==saved['metrics'][route]
        numeric=load('study/numeric.json');assert numeric==saved['numeric']
        expected=[(r['id'],prefix) for r in data['numeric'] for prefix in [0,24]]
        for precision in ['fp16','fp32']:
            assert [(r['id'],r['observed_prefix_tokens']) for r in numeric[precision]['probes']]==expected
        assert sum(numeric['fp16']['parameter_dtypes'].values())==sum(numeric['fp32']['parameter_dtypes'].values())
        nonfinite=any(numeric[p]['nonfinite_weight_elements'] or any(not r['finite'] for r in numeric[p]['probes']) for p in numeric)
        low_cosine=sum(r['fp16_fp32_cosine'] is not None and r['fp16_fp32_cosine']<plan['numeric_warning']['cosine_below'] for r in numeric['fp32']['probes'])
        warning=bool(nonfinite or low_cosine>=plan['numeric_warning']['at_least_pairs'])
        conditional=bool(numeric['fp16']['nonfinite_weight_elements'] or any(not r['finite'] for r in numeric['fp16']['probes']))
        assert ('study/plain-fp32-conditional.json' in manifest)==conditional
        if conditional:assert len(load('study/plain-fp32-conditional.json')['records'])==6
        f,g=metrics['fewshot'],metrics['grammar'];gate=plan['fewshot_interest']
        interest=(f['exact']>=gate['exact_min'] and f['required_changes_correct']>=gate['changes_min']
            and f['critical_wrong_fact_cases']<=gate['critical_wrong_max'] and f['exact']-g['exact']>=gate['gain_min'])
        return {'study':plan['study'],'status':status,'hardware':load('hardware.json'),'metrics':metrics,
            'plain_controls':plain,'plain_strict_trimmed_matches':sum(r['strict_trimmed_match'] for r in plain),
            'numeric':numeric,'numerical_warning':warning,'low_cosine_pairs':low_cosine,
            'fewshot_interest_gate_passed':interest,'can_expand_fewshot_evaluation':interest and not warning,
            'product_promotion':False,'generated_outputs':54+6*int(conditional),'numerical_forward_probes':16,
            'archive_sha256':outer['sha256'],'archive_bytes':outer['bytes'],'crc_manifest_source_data_verified':True,
            'numerical_audit_scope':'Decision recomputed from recorded instrumented cosine/top5/finite metadata. Full logits not retained, so cosine itself requires replaying the pinned numerical forwards to independently reproduce.',
            'scope':plan['scope']}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('run');p.add_argument('--output',required=True);a=p.parse_args()
    result=audit(a.run)
    with Path(a.output).open('x') as stream:stream.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False,indent=2))
