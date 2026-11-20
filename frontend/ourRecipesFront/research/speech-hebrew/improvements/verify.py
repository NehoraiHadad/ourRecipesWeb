"""Re-score saved comparisons and verify frozen sources without model inference."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
load = lambda name: json.loads((ROOT / name).read_text())
protocol = load('evidence/protocol.json')
browser = load('evidence/browser-protocol.json')
for record in (protocol, browser):
    for name, digest in record['sourceSha256'].items():
        assert sha(ROOT / name) == digest, name
assert sha(ROOT / 'evidence/input-reconstruction.json') == protocol['inputManifestSha256']
for filename in ('compare.mjs', 'compare-browser.mjs'):
    subprocess.run(['node', str(ROOT / filename), '--verify-only'], check=True, capture_output=True)
# The shared scorer is exactly the corrected, published baseline scorer.
relative = 'frontend/ourRecipesFront/research/speech-hebrew/metrics.mjs'
committed = subprocess.check_output(['git', 'show', protocol['baseCommit'] + ':' + relative], cwd=ROOT)
assert (ROOT.parent / 'metrics.mjs').read_bytes() == committed
model_checks = {}
for name, info in protocol['models'].items():
    file = Path('/tmp/voice-models') / name
    if file.exists():
        assert file.stat().st_size == info['bytes'] and sha(file) == info['sha256'], name
        model_checks[name] = True
runtime = load('evidence/wasm-source.json')
runtime_checks = {}
for name, info in runtime['files'].items():
    file = Path('/dev/shm/ourrecipes-speech-wasm/sherpaw-asr') / name
    if file.exists():
        assert file.stat().st_size == info['bytes'] and sha(file) == info['sha256'], name
        runtime_checks[name] = True
pcm_checks = 0
for row in load('evidence/input-reconstruction.json')['records']:
    file = Path('/dev/shm/ourrecipes-speech-decoder-input') / row['file']
    if file.exists():
        assert file.stat().st_size == row['bytes'] and sha(file) == row['sha256'], row['id']
        pcm_checks += 1
evidence = ['protocol.json', 'browser-protocol.json', 'input-reconstruction.json', 'greedy.json',
            'beam4.json', 'comparison.json', 'browser-smoke.json', 'browser-full.json',
            'browser-comparison.json', 'wasm-source.json']
print(json.dumps({'frozenSourceHashes': True, 'nativeComparisonReproduced': True,
                  'browserComparisonReproduced': True, 'publishedScorerUnchanged': True,
                  'availableModelFilesVerified': model_checks, 'availableRuntimeFilesVerified': runtime_checks,
                  'availableExactPcmInputsVerified': pcm_checks,
                  'note': 'Models/runtime/PCM are optional for an offline saved-output audit. Counts describe this invocation.',
                  'evidenceSha256': {name: sha(ROOT / 'evidence' / name) for name in evidence}}, indent=2))
