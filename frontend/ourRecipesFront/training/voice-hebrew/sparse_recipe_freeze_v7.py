"""Prepare and freeze a diagnostic, retaining the anomalous original V6 evidence."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import zipfile
from sparse_recipe_language_probe_v5 import build

ROOT = Path(__file__).resolve().parent


def sha(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def create(name,value):
    with (ROOT/name).open('x') as stream:stream.write(json.dumps(value,ensure_ascii=False,indent=2)+'\n')


def prepare():
    v6=json.loads((ROOT/'verification/sparse-recipe-data-v6-20261116.json').read_text())
    archive=ROOT/'runs/ourrecipes-reference-v6r-20261116/results.zip'
    with zipfile.ZipFile(archive) as src:records=json.loads(src.read('study/teacher-json.json'))['records']
    numeric=[]
    for index in [0,2,4,8]:
        row=v6['hard'][index]
        assert row['id']==records[index]['id']
        numeric.append({'id':row['id'],'input':row['input'],'observed_tokens':records[index]['tokens'][:24]})
    plain=[
        ('כתוב בדיוק את המילה שלום, בלי סימני פיסוק.', 'שלום'),
        ('נאמר: הוספתי מים אבל לא ערבבתי. האם כבר ערבבתי? ענה רק כן או לא.', 'לא'),
        ('נאמר: אולי שמתי קמח, אני לא בטוח. האם אפשר לקבוע בוודאות ששמתי קמח? ענה רק כן או לא.', 'לא'),
        ('נאמר: התחלתי לערבב ולא סיימתי. האם הערבוב הושלם? ענה רק כן או לא.', 'לא'),
        ('נאמר: גמרתי לערבב את הבלילה. האם הערבוב הושלם? ענה רק כן או לא.', 'כן'),
        ('נאמר: הוספתי מים אבל לא ערבבתי. האם הוספתי מים? ענה רק כן או לא.', 'כן')]
    data={'language':build()['he'],'plain':[{'id':'v7-plain-'+str(i),'utterance':t,'expected_text':e} for i,(t,e) in enumerate(plain)],
          'numeric':numeric,'numeric_origin_archive_sha256':sha(archive)}
    name='verification/sparse-recipe-data-v7-20261116.json'
    if (ROOT/name).exists():assert json.loads((ROOT/name).read_text())==data
    else:create(name,data)


def freeze():
    prepare()
    v6=json.loads((ROOT/'verification/sparse-recipe-plan-v6-20261116.json').read_text())
    names=['sparse_recipe_diagnosis_v7.py','sparse_recipe_freeze_v7.py','sparse_recipe_job_v7.py','sparse_recipe_colab_v7.py',
        'sparse_recipe_reference_v6.py','sparse_recipe_v3.py','sparse_recipe_data_v3.py','sparse_recipe_data_v4.py',
        'sparse_recipe_language_probe_v5.py','tests/test_sparse_recipe_v7.py','SPARSE_RECIPE_V7_PLAN.he.md']
    artifacts=['verification/sparse-recipe-data-v7-20261116.json','verification/sparse-recipe-preflight-v7-20261116.json',
        'verification/sparse-recipe-data-v6-20261116.json','runs/ourrecipes-reference-v6r-20261116/results.zip']
    plan={'study':'sparse-recipe-v7-teacher-numerics-and-contract-diagnosis','created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'source_sha256':{n:sha(ROOT/n) for n in names},'artifact_sha256':{n:sha(ROOT/n) for n in artifacts},
        'model':v6['models']['teacher'],'dependencies':v6['dependencies'],'data_file':artifacts[0],
        'max_sequence_tokens':1024,'max_study_seconds':1200,'max_owner_seconds':2400,
        'routes':['plain','free','grammar','fewshot'],'fewshot_interest':{'exact_min':13,'changes_min':8,'critical_wrong_max':0,'gain_min':4},
        'numeric_warning':{'nonfinite':True,'cosine_below':.99,'at_least_pairs':2},
        'scope':'Diagnostic only: reused16 authored Hebrew language probes in3 routes,6 plain controls,16 numerical forwards on4 exposed V6 inputs. Conditional6 FP32 plain generations only if nonfinite FP16 weights/logits. No training, protected test, phone, browser or product approval.'}
    create('verification/sparse-recipe-plan-v7-20261116.json',plan)
    print(json.dumps({'frozen':True,'generated_outputs':54,'numeric_forwards':16},indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--prepare-data',action='store_true');a=p.parse_args()
    prepare() if a.prepare_data else freeze()
