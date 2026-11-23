"""Evaluate locally exported clips. Keep private inputs and results outside Git."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent


def evaluate(files, output):
    if output.exists():
        raise ValueError('Choose a new output path')
    with tempfile.TemporaryDirectory(prefix='kitchen-replay-') as directory:
        cache = Path(directory)
        rows = []
        for i, file in enumerate(files):
            if file.stat().st_size > 12 * 1024 * 1024:
                raise ValueError('Capture exceeds size limit')
            item = json.loads(file.read_text())
            if item['format'] != 'ourrecipes-kitchen-audio-v1' or not item['reference'].strip():
                raise ValueError('Missing capture version or reference')
            audio = base64.b64decode(item['audioBase64'], validate=True)
            pcm = subprocess.run(
                ['ffmpeg', '-v', 'error', '-protocol_whitelist', 'pipe', '-i', 'pipe:0',
                 '-map', '0:a:0', '-t', '31', '-ar', '16000', '-ac', '1', '-f', 'f32le', 'pipe:1'],
                input=audio, stdout=subprocess.PIPE, check=True, timeout=30).stdout
            if not 0 < len(pcm) <= 30 * 16000 * 4:
                raise ValueError('Clip must contain up to 30 seconds of audio')
            name = f'clip-{i+1}'
            (cache / (name + '.pcm')).write_bytes(pcm)
            rows.append(dict(filename=name, pcm_sha256=hashlib.sha256(pcm).hexdigest(),
                             speakerCode=item.get('speakerCode'), reference=item['reference'], scenario=item['scenario'], condition=item['condition']))
        manifest = cache / 'manifest.json'
        manifest.write_text(json.dumps({'records': rows}, ensure_ascii=False))
        raw = cache / 'results.json'
        subprocess.run(['node', str(ROOT.parent / 'fresh/run.mjs')], check=True,
                       env={**os.environ, 'SPEECH_NEW_CACHE': directory, 'SPEECH_MANIFEST': str(manifest),
                            'SPEECH_RESULT': str(raw)})
        result = json.loads(raw.read_text())
        result['fixtures'] = rows
        with output.open('x', encoding='utf8') as dest:
            json.dump(result, dest, ensure_ascii=False, indent=2)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('files', nargs='+', type=Path)
    args = parser.parse_args()
    evaluate(args.files, args.output)
