"""Reproducible corpus + review sheet; stdlib only, no model/network access."""
import argparse
import csv
import json
import zipfile
from collections import Counter
from pathlib import Path
from corpus import ROOT, LABELS, MODEL_ID, MODEL_REVISION, digest, recipes, examples, queries, validate, load_data


def prepare():
    root=ROOT/"data";root.mkdir(exist_ok=True)
    recs=recipes();rows=[r for recipe in recs for r in examples(recipe)]
    counts=validate(recs,rows)
    (root/"recipes.json").write_text(json.dumps(recs,ensure_ascii=False,indent=2)+"\n")
    for split in ["train","validation","test"]:
        (root/f"{split}.jsonl").write_text("".join(json.dumps(r,ensure_ascii=False)+"\n" for r in rows if r["split"]==split))
    with (root/"review.csv").open("w",encoding="utf-8-sig",newline="") as f:
        out=csv.writer(f);out.writerow(["id","split","recipe","source_actions","state","previous","utterance","gold_intent","gold_changes","human_decision","reviewer","notes"])
        by_id={r["id"]:r for r in recs}
        for r in rows:
            recipe=by_id[r["recipe_id"]]
            out.writerow([r["id"],r["split"],recipe["title"],json.dumps(recipe["actions"],ensure_ascii=False),json.dumps(r["state"],ensure_ascii=False),json.dumps(r["previous"],ensure_ascii=False),r["utterance"],r["gold"]["intent"],json.dumps(r["gold"]["changes"],ensure_ascii=False),"pending","",""])
    query_counts=Counter(q["label"] for recipe in recs for r in rows if r["recipe_id"]==recipe["id"] for q in queries(recipe,r))
    files={p.name:digest(p.read_bytes()) for p in sorted(root.glob("*")) if p.name!="manifest.json"}
    manifest={"schema":1,"origin":"original synthetic authored fixtures, not human-reviewed","human_review":"pending","model":MODEL_ID,"model_revision":MODEL_REVISION,"labels":LABELS,"counts":counts,"query_label_counts":dict(query_counts),"files":files,"corpus_sha256":digest(files),"notes":"720 templated conversations are not 720 independently collected utterances. Recipes and exact utterances are held out. Controlled report templates are shared across splits; non-report wording families are held out. This is not a fully paraphrase-disjoint or natural-speech evaluation."}
    (root/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"counts":counts,"query_labels":query_counts,"sha256":manifest["corpus_sha256"]},ensure_ascii=False,indent=2))


def bundle(output, data=ROOT/"data"):
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    names=["corpus.py","engine.py","prepare.py","train.py","evaluate.py","export.py","review.py","plan.py","modal_train.py","colab_job.py","colab_pilot.py","diagnose.py","ablation.py","challenge.py","make_notebook.py","browser-smoke.mjs","requirements.txt","requirements-py313.txt","requirements-modal.txt","OurRecipes-Hebrew-Training.ipynb","README.he.md","COLAB_RESULTS.he.md","research-prompt.he.md","VERIFICATION.md"]
    names += ['span_pilot.py','span_evaluate.py','challenge_evaluate.py','tokenizer_fixtures.py','tokenizer-smoke.mjs','targeted_data.py','targeted_sweep.py','fresh_diagnostic.py','TARGETED_PLAN.he.md','TARGETED_RESULTS.he.md','requirements-export.txt','TRAINING_APPROACH.he.md','TRAINING_RESULTS.he.md']
    names += ['semantic_data.py','semantic_sweep.py','semantic_summary.py','SEMANTIC_PLAN.he.md','SEMANTIC_RESULTS.he.md']
    allowed=[ROOT/name for name in names if (ROOT/name).exists()]
    allowed += [ROOT/"tests"/name for name in ["test_materials.py","test_colab_controls.py","test_ablation.py","test_spans.py","test_semantic.py","ml_smoke.py"] if (ROOT/"tests"/name).exists()]
    allowed += [ROOT/"verification"/name for name in ["materials.json","cpu-resume.json","browser.json","export.json","colab-pilots-20261111.json","py313-cpu.json","py313-browser.json"] if (ROOT/"verification"/name).exists()]
    allowed += [ROOT/'verification'/name for name in ['ablation-plan-20261111.json','ablation-results-20261111.json',
        'baseline-diagnostic-20261111.json','encoder-options-20261111.json','span-plan-20261111.json',
        'span-convergence-plan-20261111.json','span-base-plan-20261111.json','span-results-20261111.json',
        'span-cpu-browser-20261111.json','tokenizer-browser-20261111.json','balanced-resume-20261111.json',
        'base-tokenizer-browser-20261111.json','span-train-only-cpu-20261111.json',
        'targeted-plan-20261111.json','targeted-results-20261111.json','targeted-runtime-20261111.json']
        if (ROOT/'verification'/name).exists()]
    allowed += [ROOT/'verification'/name for name in ['semantic-plan-20261111.json','semantic-audit-20261111.json','semantic-results-20261111.json','semantic-mechanics-20261111.json'] if (ROOT/'verification'/name).exists()]
    with zipfile.ZipFile(output,"w",zipfile.ZIP_DEFLATED) as z:
        for p in sorted(allowed):z.write(p,p.relative_to(ROOT))
        manifest=json.loads((Path(data)/"manifest.json").read_text())
        for name in sorted(set(manifest["files"])|{"manifest.json"}):
            if Path(name).name!=name:raise ValueError("Invalid manifest path")
            z.write(Path(data)/name,"data/"+name)
    print(f"Bundle: {output} ({output.stat().st_size} bytes); no application/user files or credentials")

if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--bundle");parser.add_argument("--data");args=parser.parse_args()
    if args.data:
        if not args.bundle:parser.error("--data is for bundling an existing corpus; requires --bundle")
        from engine import verify_manifest
        verify_manifest(args.data);load_data(Path(args.data))
    else:prepare()
    if args.bundle:bundle(args.bundle,Path(args.data) if args.data else ROOT/"data")
