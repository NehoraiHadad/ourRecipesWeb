"""Explicit source/research packet and small heads; no full encoder or credentials."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile
from corpus import ROOT, digest
from state_pilot_package import pack as base_pack

FILES = [
    'reference_contract.py', 'reference_data.py', 'reference_train.py',
    'reference_evaluate.py', 'reference_scope.py', 'reference_scope_evaluate.py',
    'reference_package.py', 'state_pilot_summary.py', 'STATE_RESULTS.he.md',
    'STATE_PILOT_RESULTS.he.md', 'REFERENCE_RESULTS.he.md',
    'tests/test_reference_contract.py',
    'verification/reference-head-selection-20261112.json',
    'verification/reference-head-results-20261112.json',
    'verification/reference-scope-plan-20261112.json',
    'verification/reference-scope-fixtures-20261112.json',
    'verification/reference-scope-selection-20261112.json',
    'verification/reference-scope-results-20261112.json',
    'verification/state-v12-early-stop-20261112.json',
    'verification/state-v12-sampling-audit-20261112.json',
    'verification/state-v13-sampling-audit-20261112.json',
]


def pack(output, folder):
    folder = Path(folder)
    selected = json.loads((folder/'scope-test-once/selection-frozen.json').read_text())
    result = json.loads((folder/'result.json').read_text())
    for name, sha in result['plan']['source_sha256'].items():
        if digest((ROOT/name).read_bytes()) != sha: raise ValueError('Selected source changed')
    base = ROOT/'runs/colab-state-v12/recovered/ablations/control-42/run/model'
    with (base/'model.safetensors').open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != selected['body_sha256']: raise ValueError('Backbone changed')
    base_pack(output, base)
    with zipfile.ZipFile(output, 'a', zipfile.ZIP_DEFLATED) as packet:
        names = set(packet.namelist())
        for name in FILES:
            path = ROOT/name
            if not path.is_file(): raise ValueError('Missing material: '+name)
            if name not in names: packet.write(path, name)
        for name in ('head-42.pt', 'head-17.pt', 'plan.json', 'result.json', 'training.json'):
            packet.write(folder/name, 'reference-artifact/'+name)
        for variant in selected['variants']:
            if digest((folder/f"head-{variant['seed']}.pt").read_bytes()) != variant['head_sha256']: raise ValueError('Head changed')
        artifact = {
            'status': 'Research only; see fresh-scope results, not approved for app',
            'head_parameters': 200324, 'head_bytes_each': 803592,
            'backbone_bytes': 735066976, 'backbone_sha256': selected['body_sha256'],
            'backbone_local_path': str(base/'model.safetensors'),
            'backbone_included': False,
            'public_base_is_not_a_substitute': 'This SHA identifies an already adapted encoder. Public DictaBERT weights alone are not byte-equivalent and must not be paired with these heads as if equivalent.',
            'primary_seed': 42, 'secondary_seed': 17,
            'selected': [{'seed': v['seed'], 'threshold': v['threshold'], 'sha256': v['head_sha256']} for v in selected['variants']],
            'license': 'DictaBERT CC-BY-4.0; preserve RESEARCH_MODEL_ATTRIBUTION.txt',
            'evaluation': 'Original120 unscored;736 consumed by R2; fresh96 consumed once by R4. Synthetic authored, not device/voice/human reviewed.'}
        packet.writestr('reference-artifact/artifact.json', json.dumps(artifact, ensure_ascii=False, indent=2)+'\n')
        manifest = {name: digest(packet.read(name)) for name in sorted(packet.namelist())}
        packet.writestr('packet-sha256.json', json.dumps(manifest, indent=2)+'\n')
        if packet.testzip() is not None: raise ValueError('CRC failure')
    with Path(output).open('rb') as stream: sha = hashlib.file_digest(stream, 'sha256').hexdigest()
    proof = {'path': str(Path(output).resolve()), 'bytes': Path(output).stat().st_size,
        'sha256': sha, 'members': len(manifest)+1, 'crc_verified': True,
        'full_encoder_included': False, 'small_semantic_heads_included': [42,17],
        'privacy': 'Explicit source/fixture/small-head allowlist; no app data, credentials, usage-private logs or full encoder.'}
    (ROOT/'verification/reference-package-20261112.json').write_text(json.dumps(proof, indent=2)+'\n')
    print(json.dumps(proof))
    return proof


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output'); parser.add_argument('folder'); args = parser.parse_args()
    pack(args.output, args.folder)
