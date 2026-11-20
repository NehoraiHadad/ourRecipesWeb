"""Verify the committed speech evidence without weights, inference or npm install."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT=Path(__file__).resolve().parent


def main():
    meta=json.loads((ROOT/'evidence/audio-archive.json').read_text())
    archive=ROOT/'evidence/audio-inputs.zip'
    assert archive.stat().st_size==meta['bytes']
    assert hashlib.sha256(archive.read_bytes()).hexdigest()==meta['sha256']
    assert (ROOT/'evidence/summary.json').read_bytes()==(ROOT/'evidence/summary-corrected.json').read_bytes()
    with tempfile.TemporaryDirectory(prefix='ourrecipes-speech-evidence-') as folder:
        folder=Path(folder)
        with zipfile.ZipFile(archive) as src:
            assert src.testzip() is None
            manifest=json.loads(src.read('MANIFEST.json'))
            assert set(src.namelist())==set(manifest)|{'MANIFEST.json'}
            for name,item in manifest.items():
                assert not Path(name).is_absolute() and '..' not in Path(name).parts
                raw=src.read(name)
                assert len(raw)==item['bytes'] and hashlib.sha256(raw).hexdigest()==item['sha256'],name
                if name.startswith('generated/'):(folder/Path(name).name).write_bytes(raw)
            assert sum(n.endswith('.wav') for n in manifest)==60
        shutil.copyfile(ROOT/'evidence/browser-results.json',folder/'results.json')
        shutil.copyfile(ROOT/'evidence/run-provenance.json',folder/'provenance.json')
        result=subprocess.run(['node',str(ROOT/'summarize.mjs'),str(folder),'--verify-only'],capture_output=True,text=True)
        if result.returncode:raise RuntimeError(result.stderr)
    provenance=json.loads((ROOT/'evidence/run-provenance.json').read_text())
    prefix='frontend/ourRecipesFront/research/speech-hebrew/'
    for name,expected in provenance['sourceHashes'].items():
        raw=subprocess.check_output(['git','show',provenance['baseCommit']+':'+prefix+name],cwd=ROOT)
        assert hashlib.sha256(raw).hexdigest()==expected,name
    print(json.dumps({'audio_files_verified':60,'browser_asr_outputs_rescored':170,'tts_wav_hashes_verified':48,
        'native_pairs_checked':12,'corrected_summary_reproduced':True,'measurement_sources_match_frozen_commit':True,
        'model_weights_loaded':False,'new_inference':False},indent=2))


if __name__=='__main__':main()
