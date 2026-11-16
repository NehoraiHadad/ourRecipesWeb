"""Freeze matched example exposure for one offline Hebrew teacher adaptation."""
import argparse
import copy
import datetime
import hashlib
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parent


def sha(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def create(name,value):
    with (ROOT/name).open('x') as stream:stream.write(json.dumps(value,ensure_ascii=False,indent=2)+'\n')


def prepare():
    old=json.loads((ROOT/'verification/sparse-recipe-results-v5-20261116.json').read_text())
    archive=ROOT/'runs/ourrecipes-sparse-v5-20261116/results.zip'
    assert sha(archive)==old['archive_sha256']
    data=json.loads((ROOT/'verification/sparse-recipe-control-data-v5-20261116.json').read_text())['splits']['train']
    by_id={r['id']:i for i,r in enumerate(data)}
    with zipfile.ZipFile(archive) as src:
        curve=[json.loads(line) for line in src.read('study/control/training.jsonl').decode().splitlines()]
    assert [r['step'] for r in curve]==list(range(1,161))
    ids=[id for r in curve for id in r['example_ids']];assert len(ids)==640
    order={'indices':[by_id[id] for id in ids],'example_ids':ids,'source_archive_sha256':old['archive_sha256'],
        'scope':'Exact observed V5 replay640 examples, including repeats, not new data.'}
    endpoint=old['arms']['control']['steps'][-1]
    reference={'endpoint':{k:endpoint[k] for k in ['step','all_development','primary','by_cell','regression']},
        'source_archive_sha256':old['archive_sha256'],'scope':'Cached trained0.6B replay endpoint, not a fresh parallel control.'}
    for name,value in [('verification/sparse-recipe-order-v9-20261116.json',order),('verification/sparse-recipe-reference-v9-20261116.json',reference)]:
        if (ROOT/name).exists():assert json.loads((ROOT/name).read_text())==value
        else:create(name,value)


def freeze():
    prepare()
    assert not json.loads((ROOT/'verification/sparse-recipe-results-v8-20261116.json').read_text())['interest_gate_passed']
    v7=json.loads((ROOT/'verification/sparse-recipe-plan-v7-20261116.json').read_text())
    names=['recipe_teacher_sft_v9.py','recipe_teacher_study_v9.py','recipe_teacher_freeze_v9.py','recipe_teacher_job_v9.py',
        'recipe_teacher_colab_v9.py','tests/test_recipe_teacher_v9.py','SPARSE_RECIPE_V9_PLAN.he.md',
        'sparse_recipe_v3.py','sparse_recipe_data_v3.py','sparse_recipe_data_v4.py','sparse_recipe_study_v4.py','sparse_recipe_sft.py']
    source={n:sha(ROOT/n) for n in names}
    arm=copy.deepcopy(json.loads((ROOT/'verification/sparse-recipe-control-plan-v5-20261116.json').read_text()))
    arm.update(study='sparse-recipe-v9-hebrew-teacher-contract',source_sha256=source,
        created_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        model=copy.deepcopy(v7['model']),official_stop_ids=[151645,151643],pad_token_id=151643,assistant_end_token_id=151645)
    token_meta=json.loads(Path('/dev/shm/voice-dicta-tokenizer-meta.json').read_text())
    arm['model']['small_file_sha256']={n:meta['sha256'] for n,meta in token_meta.items()}
    arm['model']['small_file_sha256']['config.json']='64e2e3f6508be6ee471c78648cec6b31635aea574c6daa7547066bbc243e865e'
    arm['model']['small_file_sha256']['generation_config.json']=sha(ROOT/'verification/sparse-recipe-generation-config-v8-20261116.json')
    order='verification/sparse-recipe-order-v9-20261116.json'
    arm['training'].update(schedule_file=order,schedule_sha256=sha(ROOT/order))
    arm['scope']='One1.7B teacher; exact cached0.6B example exposure; same optimization, official assistant end supervised. Fixed160 endpoint. Not phone or independent quality.'
    arm_name='verification/sparse-recipe-teacher-plan-v9-20261116.json';create(arm_name,arm)
    artifacts=[arm_name,arm['data_file'],'verification/sparse-recipe-data-v5-20261116.json',order,
        'verification/sparse-recipe-reference-v9-20261116.json','verification/sparse-recipe-preflight-v9-20261116.json',
        'verification/sparse-recipe-results-v8-20261116.json','verification/sparse-recipe-generation-config-v8-20261116.json']
    plan={'study':arm['study'],'created_utc':arm['created_utc'],'source_sha256':source,
        'artifact_sha256':{n:sha(ROOT/n) for n in artifacts},'arm_plan_file':arm_name,'arm_data_file':arm['data_file'],
        'master_data_file':'verification/sparse-recipe-data-v5-20261116.json','reference_file':'verification/sparse-recipe-reference-v9-20261116.json',
        'dependencies':v7['dependencies'],'max_study_seconds':3600,'max_owner_seconds':4500,
        'scope':'One fresh Hebrew1.7B LoRA,160 updates with exactly same640 sampled TRAIN examples as cached0.6B V5 replay; not equal FLOPs/time/parameter count.840 repeated exposed development/regression outputs plus36 TRAIN-fit. No protected test, product approval, browser or phone. Offline teacher candidate only if unchanged standard gate and strict teacher utility both pass.'}
    create('verification/sparse-recipe-plan-v9-20261116.json',plan)
    print(json.dumps({'frozen':True,'training_updates':160,'sampled_examples':640,'new_outputs':876},indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--prepare-data',action='store_true');a=p.parse_args()
    prepare() if a.prepare_data else freeze()
