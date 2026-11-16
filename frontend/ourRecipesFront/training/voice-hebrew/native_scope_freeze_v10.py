"""Freeze a data intervention with a byte-exact cached baseline and index control."""
import argparse
import copy
import datetime
import hashlib
import json
from pathlib import Path
import zipfile
from native_scope_data_v10 import build

ROOT=Path(__file__).resolve().parent


def sha(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def create(name,value):
    with (ROOT/name).open('x') as stream:stream.write(json.dumps(value,ensure_ascii=False,indent=2)+'\n')


def prepare():
    frozen=json.loads((ROOT/'verification/native-scope-data-v10-20261116.json').read_text())
    assert build()==frozen
    audit=json.loads((ROOT/'verification/sparse-recipe-results-v5-20261116.json').read_text())
    archive=ROOT/'runs/ourrecipes-sparse-v5-20261116/results.zip';assert sha(archive)==audit['archive_sha256']
    order=json.loads((ROOT/'verification/sparse-recipe-order-v9-20261116.json').read_text())
    with zipfile.ZipFile(archive) as src:
        baseline={suffix or 'primary':json.loads(src.read('study/control/validation-step-'+suffix+'0.json'))['records'] for suffix in ['','diagnostic-','regression-']}
    endpoint=audit['arms']['control']['steps'][-1]
    reference={'baseline':baseline,'endpoint':{k:endpoint[k] for k in ['step','primary','all_development','by_cell','regression']},
        'training_indices':order['indices'],'source_archive_sha256':audit['archive_sha256'],
        'scope':'Cached V5 replay0.6B; reused/exposed evidence, not a fresh parallel control.'}
    name='verification/native-scope-reference-v10-20261116.json'
    if (ROOT/name).exists():assert json.loads((ROOT/name).read_text())==reference
    else:create(name,reference)


def freeze():
    prepare()
    previous=json.loads((ROOT/'verification/sparse-recipe-plan-v5-20261116.json').read_text())
    assert sha(ROOT/'sparse_recipe_sft.py')==previous['source_sha256']['sparse_recipe_sft.py']
    names=['native_scope_data_v10.py','native_scope_study_v10.py','native_scope_freeze_v10.py','native_scope_preflight_v10.py','native_scope_job_v10.py',
        'native_scope_colab_v10.py','tests/test_native_scope_v10.py','NATIVE_SCOPE_V10_PLAN.he.md',
        'sparse_recipe_sft.py','sparse_recipe_study_v4.py','sparse_recipe_v3.py','sparse_recipe_data_v3.py','sparse_recipe_data_v4.py']
    source={n:sha(ROOT/n) for n in names}
    arm=copy.deepcopy(json.loads((ROOT/'verification/sparse-recipe-control-plan-v5-20261116.json').read_text()))
    arm.update(study='native-scope-v10-tiny-epistemic-pairs',source_sha256=source,
        created_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        data_file='verification/native-scope-data-v10-20261116.json')
    arm['data_sha256']=sha(ROOT/arm['data_file'])
    arm['scope']='One fresh0.6B LoRA with authored paired TRAIN intervention. Same engine/model/hyperparameters as cached V5 replay; must match baseline and index order. Fixed160 endpoint; no independent test/phone.'
    arm_name='verification/native-scope-arm-plan-v10-20261116.json';create(arm_name,arm)
    artifacts=[arm_name,arm['data_file'],'verification/sparse-recipe-control-data-v5-20261116.json',
        'verification/sparse-recipe-data-v5-20261116.json','verification/native-scope-reference-v10-20261116.json',
        'verification/native-scope-preflight-v10-20261116.json','verification/native-scope-authoring-review-v10-20261116.json',
        'verification/sparse-recipe-results-v9-20261116.json']
    plan={'study':arm['study'],'created_utc':arm['created_utc'],'source_sha256':source,
        'artifact_sha256':{n:sha(ROOT/n) for n in artifacts},'arm_plan_file':arm_name,'arm_data_file':arm['data_file'],
        'master_data_file':'verification/sparse-recipe-data-v5-20261116.json',
        'reference_file':'verification/native-scope-reference-v10-20261116.json',
        'dependencies':arm['dependencies'],'max_study_seconds':3600,'max_owner_seconds':4500,
        'scope':'Fresh0.6B, unchanged engine/model/inference prompt,360 TRAIN and160 updates.180 old retained,36 diverse retained,144 authored paired scenarios; not144 independent wordings or human data. Must match cached V5 baseline280 outputs and640 training index order.840 repeated development/regression outputs plus36 TRAIN-fit. No teacher labels, protected test, audio, phone/browser or product promotion.'}
    create('verification/native-scope-plan-v10-20261116.json',plan)
    print(json.dumps({'frozen':True,'same_engine_model_and_hyperparameters':True,'updates':160,'new_outputs':876},indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--prepare-data',action='store_true');a=p.parse_args()
    prepare() if a.prepare_data else freeze()
