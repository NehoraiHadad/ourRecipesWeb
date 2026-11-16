"""Bundle explicit stage-one sources and evidence. Never read held datasets."""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]
PREFIX = ROOT.relative_to(REPO).as_posix()
VERSIONS = {
    1: '93d23c9', 2: '940d2a6', 3: 'b3d1fec', 4: 'acd033d',
    5: 'c0162ea', 6: 'dc6f31c', 7: '9030ea0', 8: '5bb193b',
    9: 'a6d8f16', 10: '78161f1', 11: 'fb3acb5',
}


def main():
    files = {}
    explicit = [
        'STAGE1_RESULTS.he.md', 'STATE_CONTRACT_V1.he.md', 'PARITY_REPRODUCTION.he.md',
        'PROJECT_WORK_PLAN.he.md', 'RESEARCH_LOG.he.md', 'parity_report.py',
        'recipe_development_v1.mjs', 'recipe_development_v1.test.mjs',
        'tiny_recipe_cases.test.mjs',
        'stage1_package.py',
        'verification/recipe-development-v1-20261116.json',
        'verification/browser-native-parity-results-20261116.json',
        'verification/stage1-measurement-audit-20261116.json',
        'verification/stage1-legacy-integrity-20261116.json',
    ]
    for name in explicit:
        files[name] = (ROOT / name).read_bytes()
    for version, commit in VERSIONS.items():
        name = ('verification/browser-native-parity-plan-20261116.json' if version == 11
                else f'verification/browser-native-parity-plan-20261116-v{version}.json')
        plan_bytes = (ROOT / name).read_bytes()
        files[name] = plan_bytes
        plan = json.loads(plan_bytes)
        for source, sha in plan['source_sha256'].items():
            original = subprocess.check_output(['git', 'show', f'{commit}:{PREFIX}/{source}'], cwd=REPO)
            if hashlib.sha256(original).hexdigest() != sha:
                raise ValueError(f'Historical source mismatch: v{version}/{source}')
            files[f'frozen-sources/v{version}/{source}'] = original
            if version == 11:
                files[source] = original
    for path in sorted((ROOT / 'runs/browser-native-parity').rglob('*')):
        if path.is_file() and path.suffix in ('.json', '.jsonl', '.log', '.txt', '.mjs') or path.name == 'llama-LICENSE':
            files[path.relative_to(ROOT).as_posix()] = path.read_bytes()
    files['README-PACKET.txt'] = (
        'Stage 1 research evidence, 2026-11-16. See STAGE1_RESULTS.he.md.\n'
        'Includes synthetic development data, retained failures, raw results and source snapshots.\n'
        'No model weights, native binaries, browser runtime, held datasets or user audio.\n'
        'The full 14-case comparison is v7 at commit9030ea0; v11 is a one-token diagnostic.\n'
        'Current sources enforce their matching plan SHA. Never mix source revisions.\n'
        'Code tests need Node only. Inference replay needs the repository/runtime and pinned assets.\n'
        'No training or physical-phone test performed in this stage.\n'
    ).encode()
    manifest = {
        'study': 'stage1-contract-parity-20261116',
        'frozen_commits': VERSIONS,
        'contains_weights': False,
        'contains_held_tests': False,
        'entries': {name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                    for name, data in sorted(files.items())},
    }
    files['manifest.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    target = ROOT / 'dist/ourRecipes-stage1-contract-parity-20261116-v2.zip'
    with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            entry = zipfile.ZipInfo(name, date_time=(2026, 11, 16, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, data)
    proof = {'file': str(target), 'packet_version': 2, 'bytes': target.stat().st_size,
             'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'members': len(files)}
    (ROOT / 'verification/stage1-packet-20261116-v2.json').write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps(proof, indent=2))


if __name__ == '__main__':
    main()
