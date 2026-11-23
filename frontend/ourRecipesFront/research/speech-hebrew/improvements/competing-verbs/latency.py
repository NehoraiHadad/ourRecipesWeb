"""Stage equal SHA paired replay, cycling through the three paths in a warmed tab."""
import json
from pathlib import Path
import sys

out, fresh, controls = map(Path, sys.argv[1:])
out.mkdir(parents=True, exist_ok=False)
sequence = [(fresh, "omer-counter-clean"), (fresh, "liat-shake-water"), (controls, "dev-omer-stir-water")]
records = []
for iteration in range(3):
    for directory, stem in sequence:
        rows = json.loads((directory / "manifest.json").read_text())
        row = next(r for r in rows if r["name"] == stem)
        name = f"{stem}-{iteration}"
        (out / (name + ".wav")).symlink_to((directory / (stem + ".wav")).resolve())
        records.append({**row, "name": name})
(out / "manifest.json").write_text(json.dumps(records, ensure_ascii=False))
