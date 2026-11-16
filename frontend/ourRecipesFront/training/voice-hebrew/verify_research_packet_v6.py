"""Score lightweight copied evidence without GPU or binary checkpoints."""
import hashlib
import json
from pathlib import Path
from sparse_recipe_v3 import aggregate
from sparse_recipe_language_probe_v5 import build as language_probe

ROOT = Path(__file__).resolve().parent


def verify():
    manifest = json.loads((ROOT / 'MANIFEST.json').read_text())
    for name, meta in manifest.items():
        assert not Path(name).is_absolute() and '..' not in Path(name).parts
        raw = (ROOT / name).read_bytes()
        assert len(raw) == meta['bytes'] and hashlib.sha256(raw).hexdigest() == meta['sha256'], name
    data = json.loads((ROOT / 'verification/sparse-recipe-data-v5-20261116.json').read_text())['splits']
    v5 = ROOT / 'runs/ourrecipes-sparse-v5-20261116/recovered/study'
    count = 0
    for arm in ['control', 'diverse']:
        groups = {'': [r for r in data['development'] if r['cell'] == 'unseen-recipe/unseen-frame'],
            'diagnostic-': [r for r in data['development'] if r['cell'] != 'unseen-recipe/unseen-frame'],
            'regression-': data['regression']}
        for step in [0,80,160]:
            for prefix, rows in groups.items():
                raw = json.loads((v5 / arm / f'validation-step-{prefix}{step}.json').read_text())
                assert [r['id'] for r in rows] == [r['id'] for r in raw['records']]
                assert aggregate(rows, [r['text'] for r in raw['records']])[0] == raw['metrics']
                count += len(rows)
        extra = {'train-fit': data['control_fit' if arm == 'control' else 'diverse_fit']}
        if arm == 'diverse': extra.update({'language-' + k:v for k,v in language_probe().items()})
        for prefix, rows in extra.items():
            raw = json.loads((v5 / arm / f'validation-step-{prefix}-160.json').read_text())
            assert [r['id'] for r in rows] == [r['id'] for r in raw['records']]
            assert aggregate(rows, [r['text'] for r in raw['records']])[0] == raw['metrics']
            count += len(rows)
    data = json.loads((ROOT / 'verification/sparse-recipe-data-v6-20261116.json').read_text())
    for route in ['tiny-free', 'tiny-json', 'teacher-json']:
        raw = json.loads((ROOT / 'runs/ourrecipes-reference-v6r-20261116/recovered/study' / (route + '.json')).read_text())
        rows = data['hard'] + data['regression']; records = raw['records']
        assert [r['id'] for r in rows] == [r['id'] for r in records]
        assert aggregate(data['hard'], [r['text'] for r in records[:40]])[0] == raw['metrics']['hard']
        assert aggregate(data['regression'], [r['text'] for r in records[40:]])[0] == raw['metrics']['regression']
        count += len(rows)
    result = {'manifest_verified': True, 'outputs_rescored': count,
        'binary_checkpoint_hash_verified_here': False, 'new_inference': False}
    print(json.dumps(result, indent=2)); return result


if __name__ == '__main__': verify()
