"""Recompute teacher scores and verify exact replay exposure/checkpoint bytes."""
import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import zipfile
from recipe_teacher_study_v9 import qualify
from sparse_recipe_study_v4 import metrics_for
from sparse_recipe_v3 import aggregate

ROOT=Path(__file__).resolve().parent


def sha(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def audit(run):
    run=Path(run);plan=json.loads((ROOT/'verification/sparse-recipe-plan-v9-20261116.json').read_text())
    for name,expected in {**plan['source_sha256'],**plan['artifact_sha256']}.items():assert sha(ROOT/name)==expected,name
    settings=json.loads((ROOT/plan['arm_plan_file']).read_text())
    master=json.loads((ROOT/plan['master_data_file']).read_text())['splits']
    arm=json.loads((ROOT/plan['arm_data_file']).read_text())['splits']
    schedule=json.loads((ROOT/settings['training']['schedule_file']).read_text())
    outer=json.loads((run/'archive-manifest.json').read_text());archive=run/'results.zip'
    assert sha(archive)==outer['sha256'] and archive.stat().st_size==outer['bytes']
    with zipfile.ZipFile(archive) as src:
        assert src.testzip() is None
        manifest=json.loads(src.read('MANIFEST.json'));assert set(src.namelist())==set(manifest)|{'MANIFEST.json'}
        for name,meta in manifest.items():
            assert not Path(name).is_absolute() and '..' not in Path(name).parts
            raw=src.read(name);assert len(raw)==meta['bytes'] and hashlib.sha256(raw).hexdigest()==meta['sha256'],name
            if Path(name).suffix not in ('.pt','.safetensors'):assert (run/'recovered'/name).read_bytes()==raw,name
        load=lambda name:json.loads(src.read(name))
        status=load('status.json');environment=load('study/model/environment.json') if 'study/model/environment.json' in manifest else None
        curve=[json.loads(line) for line in src.read('study/model/training.jsonl').decode().splitlines()] if 'study/model/training.jsonl' in manifest else []
        actual_ids=[id for row in curve for id in row['example_ids']]
        assert actual_ids==schedule['example_ids'][:len(actual_ids)]
        assert [r['step'] for r in curve]==list(range(1,len(curve)+1))
        assert all(math.isfinite(r['loss']) and math.isfinite(r['grad_norm']) and r['grad_norm']>0 for r in curve)
        checkpoints={}
        for step in [80,160]:
            prefix=f'study/model/checkpoint-{step}/';name=prefix+'adapter_model.safetensors'
            if name not in manifest:continue
            with src.open(name) as stream:
                size=struct.unpack('<Q',stream.read(8))[0];assert size<2*1024**2
                header=json.loads(stream.read(size))
            tensors={k:v for k,v in header.items() if k!='__metadata__'}
            assert tensors and all(k.endswith(('lora_A.weight','lora_B.weight')) and v['dtype']=='F32' and 8 in v['shape'] for k,v in tensors.items())
            resume=prefix+'resume.pt';assert resume in manifest
            with zipfile.ZipFile(io.BytesIO(src.read(resume))) as inner:assert inner.testzip() is None
            checkpoints[str(step)]={'tensor_count':len(tensors),'adapter':manifest[name],'optimizer_rng_archive':manifest[resume],'optimizer_rng_nested_crc_verified':True}
        completed=status['status']=='complete'
        summaries=[];outcome=None;fit=None
        if completed:
            assert len(curve)==160 and len(actual_ids)==640 and set(checkpoints)=={'80','160'}
            assert environment['initial_adapter_max_logit_delta']<=1e-5
            result=load('study/result.json');engine=load('study/model/result.json')
            assert engine['full_frozen_base_hash_unchanged'] and engine['endpoint_step']==160
            for step in [0,80,160]:
                summary=metrics_for(run/'recovered/study/model',step,master);summaries.append(summary)
                for suffix,rows in [('',arm['validation']),('diagnostic-',arm['diagnostic']),('regression-',arm['regression'])]:
                    raw=load(f'study/model/validation-step-{suffix}{step}.json')
                    assert aggregate(rows,[r['text'] for r in raw['records']])[0]==raw['metrics']
                    for record in raw['records']:
                        tokens=record['tokens'];first=next((i for i,t in enumerate(tokens) if t in settings['official_stop_ids']),None)
                        if first is not None:assert all(t==settings['pad_token_id'] for t in tokens[first+1:]),record['id']
            assert summaries==result['summaries']
            raw=load('study/model/validation-step-train-fit-160.json')
            assert [r['id'] for r in raw['records']]==[r['id'] for r in arm['train_fit']]
            fit=aggregate(arm['train_fit'],[r['text'] for r in raw['records']])[0];assert fit==raw['metrics']==result['train_fit']
            reference=json.loads((ROOT/plan['reference_file']).read_text())['endpoint']
            outcome=qualify(summaries[-1],reference);assert outcome==result['decision']
        return {'study':plan['study'],'status':status,'completed':completed,'environment':environment,
            'updates':len(curve),'sampled_examples':len(actual_ids),'exact_cached_example_order_verified':True,
            'loss_first':curve[0]['loss'] if curve else None,'loss_last':curve[-1]['loss'] if curve else None,
            'summaries':summaries,'train_fit':fit,'decision':outcome,'checkpoints':checkpoints,
            'archive_sha256':outer['sha256'],'archive_bytes':outer['bytes'],'crc_manifest_sources_data_and_checkpoint_bytes_verified':True,
            'new_inference_outputs':876 if completed else None,'scope':plan['scope']}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('run');p.add_argument('--output',required=True);a=p.parse_args()
    r=audit(a.run)
    with Path(a.output).open('x') as stream:stream.write(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in r.items() if k not in ('summaries','checkpoints')},ensure_ascii=False,indent=2))
