"""Audit official stop behavior and recompute diagnostic/conditional quality scores."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile
from sparse_recipe_v3 import aggregate
from sparse_recipe_stop_v8 import check_stopped

ROOT=Path(__file__).resolve().parent


def sha(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def audit(run):
    run=Path(run);plan=json.loads((ROOT/'verification/sparse-recipe-plan-v8-20261116.json').read_text())
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
        result=load('study/result.json');metrics={};plain=[];contents={};stop_counts={};count=0
        for route in ['plain','free','grammar','fewshot']:
            raw=load('study/'+route+'.json');rows=data['plain'] if route=='plain' else data['language'];records=raw['records']
            assert [r['id'] for r in records]==[r['id'] for r in rows]
            for r in records:
                assert check_stopped(r['tokens'],plan['official_stops'])==r['stop_id']
                assert len(r['tokens'])<=(24 if route=='plain' else 96)
                assert r['prompt_tokens']+(24 if route=='plain' else 96)<=1024
            stop_counts[route]={str(k):sum(r['stop_id']==k for r in records) for k in [*plan['official_stops'],None]}
            count+=len(records)
            if route=='plain':
                plain=[{'id':row['id'],'utterance':row['utterance'],'expected_text':row['expected_text'],
                    'actual_text':r['text'],'strict_trimmed_match':r['text'].strip()==row['expected_text']} for row,r in zip(rows,records)]
            else:
                metrics[route]=aggregate(rows,[r['text'] for r in records])[0]
                assert metrics[route]==raw['metrics']==result['metrics'][route]
                old=json.loads((ROOT/'runs/ourrecipes-diagnosis-v7-20261116/recovered/study'/(route+'.json')).read_text())
                assert [r['id'] for r in old['records']]==[r['id'] for r in records]
                same=0
                for a,b in zip(old['records'],records):
                    try:same+=json.loads(a['text'])==json.loads(b['text'])
                    except (ValueError,TypeError):pass
                contents[route]={'same_raw_json_value_as_cached_v7':same,'cases':len(records),'old_metrics':old['metrics']}
        f,g=metrics['fewshot'],metrics['grammar'];gate=plan['interest_gate']
        interest=f['exact']>=gate['exact_min'] and f['required_changes_correct']>=gate['changes_min'] and f['critical_wrong_fact_cases']==0 and f['exact']-g['exact']>=gate['gain_min']
        assert interest==result['interest_gate_passed']
        assert ('study/expanded.json' in manifest)==interest
        expanded=None
        if interest:
            data_exp=json.loads((ROOT/plan['expanded_data_file']).read_text());raw=load('study/expanded.json');rows=data_exp['hard']+data_exp['regression']
            assert [r['id'] for r in rows]==[r['id'] for r in raw['records']]
            for r in raw['records']:assert check_stopped(r['tokens'],plan['official_stops'])==r['stop_id']
            lookup={r['id']:r['text'] for r in raw['records']}
            expanded={k:aggregate(v,[lookup[r['id']] for r in v])[0] for k,v in data_exp.items()}
            assert expanded==result['expanded'];count+=len(rows)
        else:assert result['expanded'] is None
        assert result['official_stops']==result['grammar_stops']==plan['official_stops']
        return {'study':plan['study'],'status':status,'hardware':load('hardware.json'),'metrics':metrics,
            'plain_controls':plain,'plain_strict_trimmed_matches':sum(r['strict_trimmed_match'] for r in plain),
            'stop_counts':stop_counts,'comparison_to_cached_v7':contents,'interest_gate_passed':interest,'expanded':expanded,
            'generated_outputs':count,'official_generation_and_grammar_stops_verified':True,'product_promotion':False,
            'archive_sha256':outer['sha256'],'archive_bytes':outer['bytes'],'crc_manifest_source_data_verified':True,'scope':plan['scope']}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('run');p.add_argument('--output',required=True);a=p.parse_args()
    result=audit(a.run)
    with Path(a.output).open('x') as stream:stream.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False,indent=2))
