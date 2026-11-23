"""Prepare a frozen paired evaluation before either decoder sees any new input."""
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent
CACHE = Path(os.environ.get("SPEECH_NEW_CACHE", "/dev/shm/ourrecipes-fresh-he"))
REV = "70bb2e84b976b7e960aa89f1c648e09c59f894dd"
URL = f"https://huggingface.co/datasets/google/fleurs/resolve/{REV}/data/he_il/"
PRIOR = ROOT.parent.parent / "evidence/human-fixtures.json"
LEXICON = "קמח מלח סוכר שמן ביצה ביצים מים לערבב אפייה בישול לבשל מטבח מתכון תנור כוס כפות אורז בצק חלב חמאה פלפל תבלינים".split()
FOOD = re.compile(r"^[ובכלמהש]{0,2}(?:" + "|".join(LEXICON) + r")$")


def fetch(name):
    return urllib.request.urlopen(URL + name, timeout=120)


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    old = {str(row["source_id"]) for row in json.loads(PRIOR.read_text())["records"]}
    with fetch("test.tsv") as response:
        tsv = response.read()
    rows = csv.reader(io.StringIO(tsv.decode()), delimiter="\t", quoting=csv.QUOTE_NONE)
    groups = {"food-word": [], "general": []}
    seen = set(old)
    for source_id, filename, raw, reference, _, samples, gender in rows:
        if source_id in seen or not 3 <= int(samples) / 16000 <= 12:
            continue
        keywords = [word for word in reference.split() if FOOD.fullmatch(word)]
        group = "food-word" if keywords else "general"
        if len(groups[group]) >= (30 if keywords else 40):
            continue
        seen.add(source_id)
        groups[group].append(dict(source_id=source_id, filename=filename, reference=reference,
                                  group=group, matched=keywords, samples=int(samples), gender=gender))
    records = groups["food-word"] + groups["general"]
    pending = {row["filename"]: row for row in records}
    with fetch("audio/test.tar.gz") as response, tarfile.open(fileobj=response, mode="r|gz") as archive:
        for member in archive:
            row = pending.get(Path(member.name).name)
            if not member.isfile() or row is None:
                continue
            audio = archive.extractfile(member).read()
            pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-ar", "16000",
                                  "-ac", "1", "-f", "f32le", "pipe:1"], input=audio,
                                 stdout=subprocess.PIPE, check=True).stdout
            assert len(pcm) == row["samples"] * 4
            row.update(wav_sha256=hashlib.sha256(audio).hexdigest(), pcm_sha256=hashlib.sha256(pcm).hexdigest())
            (CACHE / (row["filename"] + ".pcm")).write_bytes(pcm)
            del pending[row["filename"]]
            if not pending:
                break
    assert not pending and len(groups["general"]) == 40
    manifest = dict(dataset="google/fleurs", revision=REV, language="he_il", split="test",
                    attribution="Google FLEURS contributors, CC BY 4.0", url=URL,
                    tsv_sha256=hashlib.sha256(tsv).hexdigest(), lexicon=LEXICON, records=records)
    dest = ROOT / "manifest.json"
    data = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    if dest.exists():
        assert dest.read_text() == data
    else:
        dest.write_text(data)
    print({key: len(value) for key, value in groups.items()}, flush=True)


if __name__ == "__main__":
    main()
