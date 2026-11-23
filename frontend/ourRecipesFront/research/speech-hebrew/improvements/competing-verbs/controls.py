"""Stage previously triggered clips from the five prior PCM sets for browser replay."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile

parser = argparse.ArgumentParser()
parser.add_argument("out", type=Path)
parser.add_argument("corpora", nargs=5, type=Path, metavar="PCM_DIR")
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=False)
root = Path(__file__).resolve().parents[1]
windows = {r["parent"]: r for r in json.loads((root / "time-window/results.json").read_text())["records"]}
rows = []
for name, directory in zip(("dev", "holdout", "challenge", "control", "final-check"), args.corpora, strict=True):
    previous = json.loads((root / "recipe-actions" / (name + "-guarded.json")).read_text())
    triggered = {r["file"] for r in previous["evidence"]}
    base = {r["filename"]: r for r in previous["records"]}
    for row in json.loads((directory / "manifest.json").read_text())["records"]:
        stem = row["filename"]
        if stem not in triggered:
            continue
        full = name + "-" + stem
        pcm = (directory / (stem + ".pcm")).read_bytes()
        digest = hashlib.sha256(pcm).hexdigest()
        assert digest == row["pcm_sha256"] == base[stem]["pcm_sha256"]
        old = base[stem]["text"]
        if full in windows:
            record = windows[full]
            assert record["fullSha256"] == digest and record["first"] == old
            old = record["after"]
        wavfile.write(args.out / (full + ".wav"), 16000, np.frombuffer(pcm, dtype="<f4"))
        rows.append(dict(name=full, reference=row["reference"], critical=row["critical"], sha256=digest, old=old))
assert len(rows) == 21
(args.out / "manifest.json").write_text(json.dumps(rows, ensure_ascii=False))
