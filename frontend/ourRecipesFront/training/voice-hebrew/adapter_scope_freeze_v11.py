"""Freeze one change in LoRA coverage, preserving data and exposure schedule."""
import copy
import datetime
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent


def sha(name):
    with (ROOT/name).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def create(name,value):
    with (ROOT/name).open('x') as stream:stream.write(json.dumps(value,ensure_ascii=False,indent=2)+'\n')


def freeze():
    native=json.loads((ROOT/'verification/native-scope-results-v10-20261116.json').read_text())
    assert native['completed'] and native['initial280_outputs_and_tokens_matched'] and native['training_index_order_matched']
    assert not native['decision']['data_intervention_gate_passed']
    assert sha('runs/ourrecipes-native-v10-20261116/results.zip')==native['archive_sha256']
    reference=json.loads((ROOT/'verification/native-scope-reference-v10-20261116.json').read_text())
    reference['native_endpoint']=native['summaries'][-1]
    reference['native_source_archive_sha256']=native['archive_sha256']
    reference_name='verification/adapter-scope-reference-v11-20261116.json';create(reference_name,reference)
    names=['adapter_scope_sft_v11.py','adapter_scope_study_v11.py','adapter_scope_policy_v11.py',
        'adapter_scope_preflight_v11.py','adapter_scope_freeze_v11.py','adapter_scope_job_v11.py','adapter_scope_colab_v11.py',
        'tests/test_adapter_scope_v11.py','ADAPTER_SCOPE_V11_PLAN.he.md','native_scope_data_v10.py',
        'sparse_recipe_sft.py','sparse_recipe_study_v4.py','sparse_recipe_v3.py','sparse_recipe_data_v3.py','sparse_recipe_data_v4.py']
    source={n:sha(n) for n in names}
    arm=copy.deepcopy(json.loads((ROOT/'verification/native-scope-arm-plan-v10-20261116.json').read_text()))
    arm.update(study='adapter-scope-v11-tiny-attention-plus-mlp',source_sha256=source,
        created_utc=datetime.datetime.now(datetime.timezone.utc).isoformat())
    arm['training']['lora']['targets']+=['gate_proj','up_proj','down_proj']
    arm['training']['schedule_file']='verification/sparse-recipe-order-v9-20261116.json'
    arm['training']['schedule_sha256']=sha(arm['training']['schedule_file'])
    arm['scope']='Fresh tiny0.6B, same Native10 data/exposure. Only wider LoRA targets plus RNG-independent frozen sampler; fixed160 endpoint. No independent test/phone.'
    arm_name='verification/adapter-scope-arm-plan-v11-20261116.json';create(arm_name,arm)
    artifacts=[arm_name,arm['data_file'],arm['training']['schedule_file'],reference_name,
        'verification/sparse-recipe-data-v5-20261116.json','verification/native-scope-preflight-v10-20261116.json',
        'verification/adapter-scope-preflight-v11-20261116.json',
        'verification/sparse-recipe-lora-budget-v6-20261116.json',
        'verification/sparse-recipe-distillation-research-v6-20261116.json',
        'verification/native-scope-results-v10-20261116.json']
    plan={'study':arm['study'],'created_utc':arm['created_utc'],'source_sha256':source,
        'artifact_sha256':{n:sha(n) for n in artifacts},'arm_plan_file':arm_name,'arm_data_file':arm['data_file'],
        'master_data_file':'verification/sparse-recipe-data-v5-20261116.json','reference_file':reference_name,
        'dependencies':arm['dependencies'],'max_study_seconds':3600,'max_owner_seconds':4500,
        'expected_trainable_parameters':5046272,'expected_adapter_tensors':392,
        'scope':'Same tiny0.6B and360 Native10 TRAIN. Add MLP gate/up/down r8 LoRA to attention q/k/v/o. Fixed160 updates, exact cached640 indices and280 baseline outputs/tokens.876 repeated outputs; both V5/V10 anchors must pass. Fresh adapter; not teacher labels, protected test, phone/browser, quantization or product promotion.'}
    create('verification/adapter-scope-plan-v11-20261116.json',plan)
    print(json.dumps({'frozen':True,'updates':160,'trainable_expected':5046272,'new_outputs':876},indent=2))


if __name__=='__main__':freeze()
