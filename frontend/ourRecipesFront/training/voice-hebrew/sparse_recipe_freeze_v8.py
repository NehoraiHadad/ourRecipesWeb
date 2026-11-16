"""Freeze the official-stop correction without changing earlier evidence."""
import datetime
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent


def sha(p):
    with Path(p).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def freeze():
    def create(name,value):
        with (ROOT/name).open('x') as stream:stream.write(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    old=json.loads((ROOT/'verification/sparse-recipe-plan-v7-20261116.json').read_text())
    cfg=Path('/dev/shm/dicta-generation-config.json')
    name='verification/sparse-recipe-generation-config-v8-20261116.json'
    with (ROOT/name).open('xb') as stream:stream.write(cfg.read_bytes())
    names=['sparse_recipe_stop_v8.py','sparse_recipe_freeze_v8.py','sparse_recipe_job_v8.py','sparse_recipe_colab_v8.py',
        'sparse_recipe_diagnosis_v7.py','sparse_recipe_reference_v6.py','sparse_recipe_v3.py','sparse_recipe_data_v3.py',
        'sparse_recipe_data_v4.py','tests/test_sparse_recipe_v8.py','SPARSE_RECIPE_V8_PLAN.he.md']
    artifacts=['verification/sparse-recipe-data-v7-20261116.json','verification/sparse-recipe-data-v6-20261116.json',
        'verification/sparse-recipe-preflight-v8-20261116.json','verification/sparse-recipe-results-v7-20261116.json',name]
    plan={'study':'sparse-recipe-v8-official-stop-correction','created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'source_sha256':{n:sha(ROOT/n) for n in names},'artifact_sha256':{n:sha(ROOT/n) for n in artifacts},
        'data_file':artifacts[0],'expanded_data_file':artifacts[1],'model':old['model'],'dependencies':old['dependencies'],
        'official_stops':json.loads(cfg.read_text())['eos_token_id'],'generation_config_sha256':sha(cfg),
        'interest_gate':old['fewshot_interest'],'max_study_seconds':1200,'max_owner_seconds':2400,
        'scope':'Official stop policy correction in generate and grammar.54 repeated diagnostic outputs, conditional160 exposed V6 cases only if fixed interest gate passes. Cached V7 comparison, no training, independent test, phone, browser or promotion.'}
    create('verification/sparse-recipe-plan-v8-20261116.json',plan)
    print(json.dumps({'frozen':True,'official_stops':plan['official_stops'],'max_new_outputs':214},indent=2))


if __name__=='__main__':freeze()
