"""Small immutable research packet; binary training archive remains separate."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent


def build():
    names = set()
    for version in [5, 6, 7]:
        name = f'verification/sparse-recipe-plan-v{version}-20261116.json'
        plan = json.loads((ROOT / name).read_text()); names.add(name)
        names.update(plan['source_sha256']); names.update(n for n in plan['artifact_sha256'] if not n.startswith('adapter/'))
    names.update(['sparse_recipe_audit_v5.py', 'sparse_recipe_audit_v6.py', 'sparse_recipe_report.py',
        'recover_existing_colab.py', 'verify_research_packet_v6.py', 'build_research_packet_v6.py', 'analyze_sparse_errors_v6.py',
        'sparse_recipe_colab_v6_resilient.py', 'tests/test_colab_owner_v6.py', 'verification/sparse-recipe-run-v6-20261116.json',
        'sparse_recipe_audit_v7.py', 'SPARSE_RECIPE_V7_RESULTS.he.md', 'verification/sparse-recipe-results-v7-20261116.json',
        'SPARSE_RECIPE_V5_RESULTS.he.md', 'SPARSE_RECIPE_V6_RESULTS.he.md', 'SPARSE_RECIPE_V6_REPRODUCTION.he.md',
        'SPARSE_RECIPE_DISTILLATION_OPTIONS.he.md', 'PROJECT_WORK_PLAN.he.md', 'RESEARCH_LOG.he.md', 'README.he.md',
        'verification/sparse-recipe-results-v5-20261116.json', 'verification/sparse-recipe-results-v6-20261116.json',
        'verification/sparse-recipe-legacy-integrity-v6-20261116.json',
        'verification/sparse-recipe-distillation-research-v6-20261116.json',
        'verification/sparse-recipe-browser-path-v6-20261116.json',
        'verification/sparse-recipe-lora-budget-v6-20261116.json',
        'verification/sparse-recipe-runtime-storage-v6-20261116.json',
        'verification/sparse-recipe-token-budget-v6-20261116.json',
        'verification/sparse-recipe-error-analysis-v6-20261116.json'])
    runs = ['ourrecipes-sparse-v5-20261116', 'ourrecipes-reference-v6r-20261116', 'ourrecipes-diagnosis-v7-20261116']
    external = {}
    for run in runs:
        base = ROOT / 'runs' / run
        names.update(str(p.relative_to(ROOT)) for p in (base / 'recovered').rglob('*')
            if p.is_file() and p.suffix not in ('.pt', '.safetensors') and '-partial' not in p.name)
        names.add(f'runs/{run}/archive-manifest.json'); names.add(f'runs/{run}/recovery.json')
        if 'sparse-v5' not in run: names.add(f'runs/{run}/results.zip')
        else: external[f'runs/{run}/results.zip'] = json.loads((base / 'archive-manifest.json').read_text())
    target = ROOT / 'dist/ourRecipes-replay-reference-study-20261116.zip'
    missing = [n for n in names if not (ROOT / n).is_file()]
    if missing: raise FileNotFoundError('Incomplete evidence: ' + ', '.join(sorted(missing)))
    manifest = {}
    with zipfile.ZipFile(target, 'x', zipfile.ZIP_DEFLATED) as dest:
        for name in sorted(names):
            assert not any(s in name for s in ['sessions-private', 'usage-private', 'ssh-', 'adc.json'])
            raw = (ROOT / name).read_bytes(); dest.writestr(name, raw)
            manifest[name] = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        raw = (json.dumps(external, indent=2) + '\n').encode()
        dest.writestr('EXTERNAL_CHECKPOINTS.json', raw)
        manifest['EXTERNAL_CHECKPOINTS.json'] = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        dest.writestr('MANIFEST.json', json.dumps(manifest, indent=2) + '\n')
    with zipfile.ZipFile(target) as src:
        assert src.testzip() is None
        assert set(src.namelist()) == set(manifest) | {'MANIFEST.json'}
        for name, meta in manifest.items(): assert hashlib.sha256(src.read(name)).hexdigest() == meta['sha256']
    with target.open('rb') as stream: sha = hashlib.file_digest(stream, 'sha256').hexdigest()
    result = {'file': str(target), 'bytes': target.stat().st_size, 'sha256': sha,
        'members': len(manifest) + 1, 'crc_and_manifest_verified': True,
        'binary_checkpoints_external_and_preserved': external, 'base_weights_or_private_account_data_bundled': False}
    (ROOT / 'verification/sparse-recipe-packet-v6-20261116.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__': build()
