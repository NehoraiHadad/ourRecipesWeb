"""Create V6 material metadata; temporary adapter copy comes from immutable V5 ZIP."""
import datetime
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent


def freeze():
    def sha(path):
        with Path(path).open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()
    def create(name, value):
        with (ROOT / name).open('x') as stream: stream.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    v5 = json.loads((ROOT / 'verification/sparse-recipe-plan-v5-20261116.json').read_text())
    archive = ROOT / 'runs/ourrecipes-sparse-v5-20261116/results.zip'
    manifest = json.loads(archive.with_name('archive-manifest.json').read_text())
    assert sha(archive) == manifest['sha256']
    data_name = 'verification/sparse-recipe-data-v6-20261116.json'
    data = json.loads((ROOT / v5['master_data_file']).read_text())['splits']
    expected = {'hard': [r for r in data['development'] if r['cell'] == v5['primary_cell']], 'regression': data['regression']}
    if (ROOT / data_name).exists(): assert json.loads((ROOT / data_name).read_text()) == expected
    else: create(data_name, expected)
    assert [len(v) for v in expected.values()] == [40, 120]
    adapter = Path('/dev/shm/voice-v6/adapter'); adapter.mkdir(parents=True, exist_ok=True)
    artifacts = {data_name: sha(ROOT / data_name)}
    with zipfile.ZipFile(archive) as z:
        for name in ['adapter_config.json', 'adapter_model.safetensors']:
            raw = z.read('study/diverse/checkpoint-160/' + name)
            (adapter / name).write_bytes(raw)
            artifacts['adapter/' + name] = sha(adapter / name)
    names = ['sparse_recipe_reference_v6.py', 'sparse_recipe_freeze_v6.py', 'sparse_recipe_job_v6.py',
             'sparse_recipe_colab_v6.py', 'sparse_recipe_v3.py', 'sparse_recipe_data_v3.py',
             'sparse_recipe_data_v4.py', 'tests/test_sparse_recipe_v6.py', 'SPARSE_RECIPE_V6_PLAN.he.md']
    for name in ['sparse_recipe_v3.py', 'sparse_recipe_data_v3.py', 'sparse_recipe_data_v4.py']:
        assert sha(ROOT / name) == v5['source_sha256'][name]
    teacher = json.loads((ROOT / 'verification/sparse-recipe-teacher-options-v5-20261116.json').read_text())[0]
    research = json.loads(Path('/tmp/voice-lmfe-probe-metadata.json').read_text())
    card = Path('/tmp/dictalm17-card.md')
    research.append({'model_card_url': 'https://huggingface.co/' + teacher['repo'] + '/raw/' + teacher['revision'] + '/README.md',
                     'sha256': sha(card), 'bytes': card.stat().st_size})
    create('verification/sparse-recipe-research-v6-20261116.json', research)
    artifacts['verification/sparse-recipe-research-v6-20261116.json'] = sha(ROOT / 'verification/sparse-recipe-research-v6-20261116.json')
    spec = {k: teacher[k] for k in ['repo', 'revision', 'license', 'weight_bytes']}
    spec['weight_sha256'] = teacher['weights'][0]['sha256']
    plan = {'study': 'sparse-recipe-v6-structured-hebrew-reference',
        'created_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'source_sha256': {n: sha(ROOT / n) for n in names}, 'artifact_sha256': artifacts,
        'data_file': data_name, 'adapter_origin_archive_sha256': manifest['sha256'],
        'routes': ['tiny-free', 'tiny-json', 'teacher-json'],
        'models': {'tiny': v5['source_model'], 'teacher': spec},
        'dependencies': v5['dependencies'] + ['lm-format-enforcer==0.11.3', 'interegular==0.3.3', 'pydantic==2.12.4', 'PyYAML==6.0.3'],
        'batch_size': 1, 'max_new_tokens': 96, 'max_sequence_tokens': 1024,
        'max_study_seconds': 2400, 'max_owner_seconds': 3600,
        'reference_utility': {'hard_exact_min': 32, 'hard_changes_min': 19, 'hard_critical_wrong_max': 0,
                              'regression_exact_min': 90, 'regression_critical_wrong_max': 5},
        'scope': 'Inference only; exposed synthetic hard40 plus regression120, repeated three times. Actual T4, no physical phone/browser/quantization, no product promotion. Grammar versus free is matched; teacher comparison also changes pretraining/tokenizer/size.'}
    create('verification/sparse-recipe-plan-v6-20261116.json', plan)
    print(json.dumps({'frozen': True, 'data_sha256': artifacts[data_name], 'routes': plan['routes']}, indent=2))


if __name__ == '__main__': freeze()
