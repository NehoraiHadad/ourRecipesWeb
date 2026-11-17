"""Audit wider tiny-model adaptation, binary weights, exposure and both anchors."""
import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import zipfile
from native_scope_data_v10 import build
from sparse_recipe_study_v4 import metrics_for
from adapter_scope_policy_v11 import decisions
from sparse_recipe_v3 import aggregate

ROOT=Path(__file__).resolve().parent


def sha(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def audit(run):
    run=Path(run);plan=json.loads((ROOT/'verification/adapter-scope-plan-v11-20261116.json').read_text())
    for name,expected in {**plan['source_sha256'],**plan['artifact_sha256']}.items():assert sha(ROOT/name)==expected,name
    settings=json.loads((ROOT/plan['arm_plan_file']).read_text());arm=json.loads((ROOT/plan['arm_data_file']).read_text())
    assert build()==arm;arm=arm['splits']
    old=json.loads((ROOT/'verification/sparse-recipe-control-plan-v5-20261116.json').read_text())
    old_protocol=json.loads((ROOT/'verification/sparse-recipe-plan-v5-20261116.json').read_text())
    assert sha(ROOT/'verification/sparse-recipe-control-plan-v5-20261116.json')==old_protocol['artifact_sha256']['verification/sparse-recipe-control-plan-v5-20261116.json']
    for key in ['model','evaluation','seed','max_sequence_tokens']:assert settings[key]==old[key],key
    expected_training=json.loads(json.dumps(old['training']))
    expected_training['lora']['targets']+=['gate_proj','up_proj','down_proj']
    expected_training['schedule_file']='verification/sparse-recipe-order-v9-20261116.json'
    expected_training['schedule_sha256']=sha(ROOT/expected_training['schedule_file'])
    assert settings['training']==expected_training
    master=json.loads((ROOT/plan['master_data_file']).read_text())['splits']
    reference=json.loads((ROOT/plan['reference_file']).read_text())
    archive=run/'results.zip';outer=json.loads((run/'archive-manifest.json').read_text())
    assert sha(archive)==outer['sha256'] and archive.stat().st_size==outer['bytes']
    with zipfile.ZipFile(archive) as src:
        assert src.testzip() is None
        manifest=json.loads(src.read('MANIFEST.json'));assert set(src.namelist())==set(manifest)|{'MANIFEST.json'}
        for name,meta in manifest.items():
            assert not Path(name).is_absolute() and '..' not in Path(name).parts
            raw=src.read(name);assert len(raw)==meta['bytes'] and hashlib.sha256(raw).hexdigest()==meta['sha256'],name
            if Path(name).suffix not in ('.pt','.safetensors'):assert (run/'recovered'/name).read_bytes()==raw,name
        load=lambda name:json.loads(src.read(name))
        status=load('status.json');completed=status['status']=='complete'
        curve=[json.loads(line) for line in src.read('study/model/training.jsonl').decode().splitlines()] if 'study/model/training.jsonl' in manifest else []
        positions={r['id']:i for i,r in enumerate(arm['train'])}
        indices=[positions[id] for row in curve for id in row['example_ids']]
        assert indices==reference['training_indices'][:len(indices)]
        assert [r['step'] for r in curve]==list(range(1,len(curve)+1))
        assert all(math.isfinite(r['loss']) and math.isfinite(r['grad_norm']) and r['grad_norm']>0 for r in curve)
        environment=load('study/model/environment.json') if 'study/model/environment.json' in manifest else None
        matched=False
        if 'study/model/validation-step-regression-0.json' in manifest:
            matched=True
            for suffix in ['','diagnostic-','regression-']:
                raw=load(f'study/model/validation-step-{suffix}0.json')['records'];cached=reference['baseline'][suffix or 'primary']
                matched &= [(r['id'],r['text'],r['tokens']) for r in raw]==[(r['id'],r['text'],r['tokens']) for r in cached]
        checkpoints={}
        for step in [80,160]:
            prefix=f'study/model/checkpoint-{step}/';name=prefix+'adapter_model.safetensors'
            if name not in manifest:continue
            with src.open(name) as stream:
                size=struct.unpack('<Q',stream.read(8))[0];assert size<2*1024**2;header=json.loads(stream.read(size))
            tensors={k:v for k,v in header.items() if k!='__metadata__'}
            assert len(tensors)==plan['expected_adapter_tensors'] and all(k.endswith(('lora_A.weight','lora_B.weight')) and v['dtype']=='F32' and 8 in v['shape'] for k,v in tensors.items())
            assert sum(math.prod(v['shape']) for v in tensors.values())==plan['expected_trainable_parameters']
            targets=settings['training']['lora']['targets']
            for target in targets:
                assert sum('.'+target+'.' in k for k in tensors)==56,target
            config=load(prefix+'adapter_config.json')
            assert sorted(config['target_modules'])==sorted(targets) and config['r']==8 and config['lora_alpha']==16 and config['lora_dropout']==0.05
            resume=prefix+'resume.pt';assert resume in manifest
            with zipfile.ZipFile(io.BytesIO(src.read(resume))) as inner:assert inner.testzip() is None
            checkpoints[str(step)]={'adapter':manifest[name],'optimizer_rng_archive':manifest[resume],'nested_crc_verified':True}
        summaries=[];fit=None;outcome=None;engine=None
        if completed:
            assert matched and len(curve)==160 and len(indices)==640 and set(checkpoints)=={'80','160'}
            result=load('study/result.json');engine=load('study/model/result.json')
            assert engine['full_frozen_base_hash_unchanged'] and environment['initial_adapter_max_logit_delta']<=1e-5
            assert environment['trainable_parameters']==plan['expected_trainable_parameters']
            assert environment['total_parameters']-environment['trainable_parameters']==596049920
            assert all(len(r['example_ids'])==4 for r in curve)
            for row in curve:
                step=row['step'];factor=min(1.0,step/8)*(1-(step-1)/160)
                assert math.isclose(row['learning_rate'],0.0002*factor,rel_tol=1e-12)
            for step in [0,80,160]:
                summary=metrics_for(run/'recovered/study/model',step,master);summaries.append(summary)
                for suffix,rows in [('',arm['validation']),('diagnostic-',arm['diagnostic']),('regression-',arm['regression'])]:
                    raw=load(f'study/model/validation-step-{suffix}{step}.json')
                    assert [r['id'] for r in rows]==[r['id'] for r in raw['records']]
                    assert aggregate(rows,[r['text'] for r in raw['records']])[0]==raw['metrics']
            raw=load('study/model/validation-step-train-fit-160.json');assert [r['id'] for r in raw['records']]==[r['id'] for r in arm['train_fit']]
            fit=aggregate(arm['train_fit'],[r['text'] for r in raw['records']])[0];assert fit==raw['metrics']==result['train_fit']
            assert summaries==result['summaries']
            outcome=decisions(reference['endpoint'],reference['native_endpoint'],summaries[-1]);assert outcome==result['decision']
            assert result['initial_baseline_exactly_matched'] and result['training_index_order_exactly_matched']
        return {'study':plan['study'],'status':status,'completed':completed,'environment':environment,'updates':len(curve),
            'sampled_examples':len(indices),'initial280_outputs_and_tokens_matched':matched,'training_index_order_matched':True,
            'same_model_data_hyperparameters_except_targets_and_sampler_verified':True,'data_generation_reproduced':True,
            'summaries':summaries,'train_fit':fit,'decision':outcome,'checkpoints':checkpoints,
            'engine_diagnostic_best_step_not_selection':engine['best_step'] if engine else None,
            'peak_cuda_allocated_bytes':engine['peak_cuda_allocated_bytes'] if engine else None,
            'peak_cuda_reserved_bytes':engine['peak_cuda_reserved_bytes'] if engine else None,
            'engine_seconds':engine['seconds'] if engine else None,
            'loss_first':curve[0]['loss'] if curve else None,'loss_last':curve[-1]['loss'] if curve else None,
            'archive_sha256':outer['sha256'],'archive_bytes':outer['bytes'],'crc_manifest_source_data_checkpoints_verified':True,
            'new_inference_outputs':876 if completed else None,'scope':plan['scope']}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('run');p.add_argument('--output',required=True);a=p.parse_args()
    result=audit(a.run)
    with Path(a.output).open('x') as stream:stream.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ('summaries','checkpoints')},ensure_ascii=False,indent=2))
