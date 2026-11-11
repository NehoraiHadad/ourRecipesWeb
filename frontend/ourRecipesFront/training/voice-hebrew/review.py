"""Import a COPY of review.csv; preserve original immutable seed data."""
import argparse
import csv
import json
from collections import Counter
from pathlib import Path
from corpus import ROOT,digest,load_data,validate,queries
from engine import verify_manifest


def apply_review(csv_path, output, data=ROOT/"data"):
    parent=verify_manifest(data);recs,rows=load_data(Path(data));by_id={r["id"]:r for r in rows}
    seen=set();approved=0
    with Path(csv_path).open(encoding="utf-8-sig",newline="") as f:
        for entry in csv.DictReader(f):
            key=entry["id"]
            if key not in by_id or key in seen:raise ValueError("Unknown/duplicate review id")
            seen.add(key);row=by_id[key]
            if entry["split"]!=row["split"]:raise ValueError("Review cannot change split")
            recipe=recs[row["recipe_id"]]
            if entry["recipe"]!=recipe["title"] or json.loads(entry["source_actions"])!=recipe["actions"]:raise ValueError("Source action edits require a new recipe version, not a review annotation")
            decision=entry["human_decision"].strip()
            if decision not in ["pending","approved","corrected"]:raise ValueError("Decision must be pending, approved or corrected")
            if decision=="pending":continue
            if not entry["reviewer"].strip():raise ValueError("Reviewer required")
            replacement={"intent":entry["gold_intent"],"changes":json.loads(entry["gold_changes"])}
            edits=(entry["utterance"]!=row["utterance"] or replacement!=row["gold"] or json.loads(entry["state"])!=row["state"] or json.loads(entry["previous"])!=row["previous"])
            if edits and decision!="corrected":raise ValueError("Changed annotation must be marked corrected")
            row.update(utterance=entry["utterance"],gold=replacement,state=json.loads(entry["state"]),previous=json.loads(entry["previous"]),human_review=decision,reviewer=entry["reviewer"].strip(),review_notes=entry["notes"])
            approved+=1
    if seen!=set(by_id):raise ValueError("Review CSV must retain every seed row; leave unreviewed rows pending")
    validate(list(recs.values()),rows)
    output=Path(output)
    if output.exists():raise ValueError("Use a fresh output directory")
    output.mkdir(parents=True)
    (output/"recipes.json").write_text(json.dumps(list(recs.values()),ensure_ascii=False,indent=2)+"\n")
    for split in ["train","validation","test"]:
        (output/f"{split}.jsonl").write_text("".join(json.dumps(r,ensure_ascii=False)+"\n" for r in rows if r["split"]==split))
    files={p.name:digest(p.read_bytes()) for p in output.iterdir()}
    manifest={**parent,"files":files,"corpus_sha256":digest(files),"parent_corpus_sha256":parent["corpus_sha256"],"review_file_sha256":digest(Path(csv_path).read_bytes()),"human_review":f"{approved}/{len(rows)} reviewed; others pending","review_counts_by_split":{s:dict(Counter(r["human_review"] for r in rows if r["split"]==s)) for s in ["train","validation","test"]}}
    manifest["query_label_counts"]=dict(Counter(q["label"] for row in rows for q in queries(recs[row["recipe_id"]],row)))
    (output/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"output":str(output),"reviewed":approved,"pending":len(rows)-approved,"sha256":manifest["corpus_sha256"]},ensure_ascii=False,indent=2))

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("csv");p.add_argument("output");p.add_argument("--data",default=str(ROOT/"data"));a=p.parse_args();apply_review(a.csv,a.output,a.data)
