"""Summarize matched recognition results. Bootstrap resamples transcript IDs, not words."""
import argparse
import json
from pathlib import Path
import random
import statistics

def summarize(manifest, result):
    records = {(r["filename"], r["arm"]): r for r in result["records"]}
    assert len(records) == len(result["records"]) == 2 * len(manifest["records"])
    groups = {}
    for group in sorted({r["group"] for r in manifest["records"]}):
        fixtures = [r for r in manifest["records"] if r["group"] == group]
        pairs = []
        for row in fixtures:
            greedy, beam = (records[row["filename"], arm] for arm in ("greedy", "beam4"))
            assert greedy["pcm_sha256"] == beam["pcm_sha256"] == row["pcm_sha256"]
            metrics = greedy["metrics"], beam["metrics"]
            words = metrics[0]["referenceWords"]
            assert words == metrics[1]["referenceWords"] and words > 0
            pairs.append((words, metrics[0]["wordErrors"], metrics[1]["wordErrors"]))
        words, greedy_errors, beam_errors = map(sum, zip(*pairs))
        rng = random.Random(20261123)
        bootstrap = []
        for _ in range(10000):
            w, g, b = map(sum, zip(*rng.choices(pairs, k=len(pairs))))
            bootstrap.append(100 * (b - g) / w)
        bootstrap.sort()
        groups[group] = dict(clips=len(fixtures), words=words, greedyErrors=greedy_errors, beamErrors=beam_errors,
            greedyWER=greedy_errors/words, beamWER=beam_errors/words,
            deltaPercentagePoints=100*(beam_errors-greedy_errors)/words,
            descriptivePairedBootstrap95=[bootstrap[249], bootstrap[9749]],
            better=sum(b<g for _,g,b in pairs), worse=sum(b>g for _,g,b in pairs),
            unchanged=sum(b==g for _,g,b in pairs),
            decodeMedianMs={arm: statistics.median(records[r["filename"],arm]["ms"] for r in fixtures)
                            for arm in ("greedy", "beam4")})
    return groups

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("result", type=Path)
    args = p.parse_args()
    manifest = json.loads((Path(__file__).parent / "manifest.json").read_text())
    print(json.dumps(summarize(manifest, json.loads(args.result.read_text())), indent=2))
