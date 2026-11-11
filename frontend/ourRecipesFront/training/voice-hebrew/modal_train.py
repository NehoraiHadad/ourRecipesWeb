"""Explicit Modal launch only. Importing this file does not start a GPU job."""
import json
import os
import re
from pathlib import Path
import modal

ROOT=Path(__file__).resolve().parent
DATA=Path(os.environ.get("VOICE_TRAIN_DATA",str(ROOT/"data"))).resolve()
app=modal.App("ourrecipes-hebrew-status-training")
volume=modal.Volume.from_name("ourrecipes-hebrew-training",create_if_missing=True)
image=(modal.Image.debian_slim(python_version="3.12")
       .pip_install("torch==2.6.0",index_url="https://download.pytorch.org/whl/cu124")
       .pip_install_from_requirements(str(ROOT/"requirements.txt")))
# Explicit allowlist: never upload application files, .env, recordings or credentials.
for name in ["corpus.py","engine.py","train.py","evaluate.py","export.py"]:
    image=image.add_local_file(ROOT/name,"/opt/voice-training/"+name)
for name in ["recipes.json","train.jsonl","validation.jsonl","test.jsonl","manifest.json","review.csv"]:
    if (DATA/name).exists():image=image.add_local_file(DATA/name,"/opt/voice-training/data/"+name)

@app.function(image=image,cpu=(1,1),memory=(2048,2048),volumes={"/artifacts":volume},
              timeout=600,retries=0,max_containers=1)
def warm_model_cache():
    # Download public pinned weights on CPU before reserving a GPU.
    import sys
    sys.path.insert(0,"/opt/voice-training")
    from corpus import MODEL_ID,MODEL_REVISION
    from huggingface_hub import snapshot_download
    snapshot_download(MODEL_ID,revision=MODEL_REVISION,cache_dir="/artifacts/hf-cache/hub",
                      allow_patterns=["*.json","*.txt","*.safetensors"],max_workers=2)
    volume.commit()

@app.function(image=image,gpu="T4",cpu=(2,2),memory=(8192,8192),volumes={"/artifacts":volume},
              timeout=900,retries=0,max_containers=1,min_containers=0,scaledown_window=2)
def pilot(run_id: str,steps: int,resume: bool):
    import sys
    sys.path.insert(0,"/opt/voice-training")
    import os
    os.environ["HF_HOME"]="/artifacts/hf-cache"
    from train import parser,train
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}",run_id):raise ValueError("Invalid run id")
    if not 1<=steps<=500:raise ValueError("Pilot capped at 500 steps")
    argv=["--data","/opt/voice-training/data","--output","/artifacts/"+run_id,
          "--max-steps",str(steps),"--max-seconds","600","--require-gpu","--save-every","25"]
    if resume:argv.append("--resume")
    args=parser().parse_args(argv)
    return train(args,on_checkpoint=volume.commit)

@app.local_entrypoint()
def main(run_id: str="pilot-001",steps: int=200,resume: bool=False,dry_run: bool=True):
    from plan import plan
    details=plan(DATA)
    details.update(run_id=run_id,steps=steps)
    print(json.dumps(details,ensure_ascii=False,indent=2))
    if dry_run:return
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}",run_id) or not 1<=steps<=500:raise ValueError("Invalid run settings")
    warm_model_cache.remote()
    print(json.dumps(pilot.remote(run_id,steps,resume),ensure_ascii=False,indent=2))
