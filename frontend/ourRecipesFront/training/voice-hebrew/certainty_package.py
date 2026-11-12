"""V5 explicit material allowlist; three small heads, no full encoder/credentials."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile
from corpus import ROOT,digest
from certainty_train import BASE,DATA
from state_pilot_package import pack as base_pack
from reference_package import FILES as REFERENCE_FILES


def pack(output,folder):
    folder=Path(folder);result=json.loads((folder/'result.json').read_text())
    selected=json.loads((folder/'evaluation-once/selection.json').read_text())
    study=result['plan']['study']
    if study not in ('certainty-v5','certainty-position-v5'):raise ValueError('Unknown study')
    proof=json.loads((ROOT/f'verification/{study}-results-20261112.json').read_text())
    for name,sha in result['plan']['source_sha256'].items():
        if digest((ROOT/name).read_bytes())!=sha:raise ValueError('Frozen source changed: '+name)
    with (BASE/'model/model.safetensors').open('rb') as stream:
        if hashlib.file_digest(stream,'sha256').hexdigest()!=selected['body_sha256']:raise ValueError('Backbone changed')
    base_pack(output,BASE/'model')
    files=REFERENCE_FILES+['certainty_data.py','certainty_contract.py','certainty_train.py','certainty_evaluate.py','certainty_package.py',
        'tests/test_certainty.py','CERTAINTY_PLAN.he.md','CERTAINTY_RESULTS.he.md',
        'certainty_position.py','certainty_position_train.py','certainty_position_evaluate.py','certainty_compare.py',
        'certainty_adapter.py','certainty_adapter_probe.py','tests/test_certainty_adapter.py','CERTAINTY_ADAPTER_PLAN.he.md','verification/certainty-adapter-mechanics-20261112.json',
        'verification/certainty-v5-selection-20261112.json','verification/certainty-v5-results-20261112.json']
    files += [f'verification/{prefix}-{kind}-20261112.json' for prefix in ('certainty-v5','certainty-position-v5') for kind in ('selection','results','comparison') if (ROOT/f'verification/{prefix}-{kind}-20261112.json').exists()]
    # Exact source-visible seed data and legacy outputs needed by the fixed paths.
    files += ['runs/state-v13-preflight/shared/'+n for n in ('manifest.json','recipes.json','train.jsonl','validation.jsonl','test.jsonl')]
    files += ['runs/colab-state-v12/recovered/ablations/control-42/run/'+n for n in ('run-config.json','research-decision.json','validation-research-full.json')]
    files += ['runs/reference-head-cpu-r4/scope-test-once/baseline.json','runs/reference-head-cpu-r2/test-once/baseline-test.json',
        'runs/reference-head-cpu-r4/head-42.pt','runs/reference-head-cpu-r4/head-17.pt',
        'runs/certainty-v5-r1/native-baseline.json','runs/certainty-v5-r1/result.json']
    files += [str(p.relative_to(ROOT)) for p in sorted(DATA.glob('*.json'))]
    with zipfile.ZipFile(output,'a',zipfile.ZIP_DEFLATED) as packet:
        names=set(packet.namelist())
        for name in dict.fromkeys(files):
            if not (ROOT/name).is_file():raise ValueError('Missing allowed file: '+name)
            if name not in names:packet.write(ROOT/name,name);names.add(name)
        for v in selected['variants']:
            name=f"head-{v['seed']}.pt";path=folder/name
            if digest(path.read_bytes())!=v['head_sha256']:raise ValueError('Head changed')
            packet.write(path,'certainty-artifact/'+name)
        for name in ('plan.json','result.json'):packet.write(folder/name,'certainty-artifact/'+name)
        if study=='certainty-position-v5':
            parent=ROOT/'runs/certainty-v5-r1'
            for name in ('head-42.pt','head-17.pt','head-73.pt','plan.json','result.json'):
                packet.write(parent/name,'certainty-r1-artifact/'+name)
        artifact={'status':'Research only; see all-seed gates and fresh-test status',
            'study':study,'primary_seed':42,'labels':result['plan']['head_labels'],'backbone_sha256':selected['body_sha256'],
            'backbone_bytes':735066976,'backbone_included':False,'backbone_local_path':str(BASE/'model/model.safetensors'),
            'setup':'Restore exact adapted body and warm-start tokenizer/config to runs/colab-state-v12/recovered/ablations/control-42/run/model; public base alone is not byte-equivalent.',
            'variants':[{'seed':v['seed'],'threshold':v['threshold'],'sha256':v['head_sha256']} for v in selected['variants']],
            'head_parameters':proof['head_parameters'],'head_bytes':proof['head_bytes'],
            'fresh_test_scored':proof['fresh_test_scored'],'all_fresh_accepted':proof['all_fresh_accepted'],
            'license':'DictaBERT CC-BY-4.0; preserve RESEARCH_MODEL_ATTRIBUTION.txt',
            'limitations':'Authored synthetic only; no device/browser/audio/human validation; no app integration.'}
        packet.writestr('certainty-artifact/artifact.json',json.dumps(artifact,indent=2)+'\n')
        manifest={n:digest(packet.read(n)) for n in sorted(packet.namelist())}
        packet.writestr('certainty-packet-sha256.json',json.dumps(manifest,indent=2)+'\n')
        assert packet.testzip() is None
    with Path(output).open('rb') as stream:sha=hashlib.file_digest(stream,'sha256').hexdigest()
    summary={'path':str(Path(output).resolve()),'bytes':Path(output).stat().st_size,'sha256':sha,'members':len(manifest)+1,
        'crc_verified':True,'small_heads_included':[42,17,73],'full_encoder_included':False,
        'privacy':'Explicit source/synthetic-fixture/small-head allowlist; no credentials, private usage, audio or app data.'}
    (ROOT/'verification/certainty-v5-package-20261112.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary));return summary


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');p.add_argument('folder');a=p.parse_args();pack(a.output,a.folder)
