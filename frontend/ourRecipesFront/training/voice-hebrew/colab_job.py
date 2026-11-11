"""Bounded remote Colab pilot; invoked only after an explicit CLI allocation.

Expects a separately uploaded material ZIP. No cloud authentication, VM creation,
Drive mount or Hub publishing occurs inside this script.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import shutil
import subprocess
import sys
import time
import zipfile


def supplemental_seed_files(output):
    """Keep both seeds of the selected arm, without changing primary selection."""
    output=Path(output);frozen=output/'selection-frozen.json'
    if not frozen.exists():return []
    arm=json.loads(frozen.read_text()).get('selected_arm')
    if arm not in ('control','combined','data_only','loss_only'):return []
    source=output/'ablations'/f'{arm}-17'/'run'
    files=[p for p in (source/'model').rglob('*') if p.is_file()]
    files += [p for p in [source/'run-config.json',source/'best-validation.json'] if p.exists()]
    return [(p,Path('retained-checkpoints')/f'{arm}-17'/p.relative_to(source)) for p in files]


def execute(bundle, output, expected_sha, steps=200, max_seconds=900, python_version="3.13", baseline_steps=0, ablation=False, span=False, span_model='tiny', span_train_only=False, targeted=False, semantic=False, combined=False):
    started=time.monotonic();deadline=started+max_seconds
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    state={"status":"running","phase":"verify_bundle","steps_requested":steps,"started_utc":__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),"production_ready":False}
    def update(phase,**values):
        state.update(phase=phase,elapsed_seconds=time.monotonic()-started,**values)
        tmp=output/"status.partial.json";tmp.write_text(json.dumps(state,indent=2));tmp.replace(output/"status.json")
        print(json.dumps({"phase":phase,"elapsed_seconds":state["elapsed_seconds"],**values}),flush=True)
    def run(argv,phase,limit=None,env=None):
        update(phase)
        remaining=deadline-time.monotonic()
        timeout=min(limit or remaining,remaining)
        if timeout<=0:raise TimeoutError("Pilot wall-time limit exhausted")
        process=subprocess.Popen(argv,cwd=output/"material",env=env,start_new_session=True)
        try:
            rc=process.wait(timeout=timeout)
            if rc:raise RuntimeError(f"{phase} exited with status {rc}")
        except BaseException:
            if process.poll() is None:
                os.killpg(process.pid,signal.SIGTERM)
                try:process.wait(timeout=5)
                except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
            raise
    try:
        raw=Path(bundle).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=expected_sha:raise ValueError("Uploaded bundle hash mismatch")
        material=output/"material";material.mkdir()
        with zipfile.ZipFile(bundle) as archive:
            if sum(i.file_size for i in archive.infolist())>20*1024*1024:raise ValueError("Unexpected material size")
            for item in archive.infolist():
                relative=Path(item.filename)
                if relative.is_absolute() or '..' in relative.parts:raise ValueError("Unsafe bundle path")
            archive.extractall(material)
        hardware=subprocess.run(['nvidia-smi','--query-gpu=name,memory.total,driver_version','--format=csv,noheader'],capture_output=True,text=True,check=True)
        (output/"hardware.json").write_text(json.dumps({"gpu":hardware.stdout.strip(),"python":platform.python_version(),"cpu_count":os.cpu_count()},indent=2))
        uv=shutil.which('uv')
        if not uv:
            run([sys.executable,'-m','pip','install','uv==0.9.5'],'install_python_bootstrap',limit=90)
            uv=shutil.which('uv')
        if not uv:raise RuntimeError('uv bootstrap unavailable')
        env_path=output/"venv"
        run([uv,'venv','--python',python_version,'--seed',str(env_path)],'create_python_environment',limit=180)
        python=str(env_path/'bin/python')
        run([python,'-m','pip','install','torch==2.6.0','--index-url','https://download.pytorch.org/whl/cu124'],'install_torch',limit=360)
        requirements='requirements-py313.txt' if python_version=='3.13' else 'requirements.txt'
        run([python,'-m','pip','install','-r',str(material/requirements)],'install_training_dependencies',limit=180)
        environment={**os.environ,'HF_HOME':str(output/'hf-cache'),'HF_HUB_DISABLE_TELEMETRY':'1','TOKENIZERS_PARALLELISM':'false','PYTHONUNBUFFERED':'1'}
        if baseline_steps and not ablation and not span:
            baseline_seconds=min(180,int(deadline-time.monotonic()-180))
            if baseline_seconds<30:raise TimeoutError('Insufficient time for matched baseline and candidate')
            run([python,str(material/'train.py'),'--output',str(output/'baseline'),'--data',str(material/'data'),'--max-steps',str(baseline_steps),'--max-seconds',str(baseline_seconds),'--save-every','50','--require-gpu'],'matched_baseline',limit=baseline_seconds+20,env=environment)
        run_path=output/'run'
        train_seconds=min(1700 if combined else 1600 if semantic else 800 if targeted else 600,int(deadline-time.monotonic()-90))
        if train_seconds<30:raise TimeoutError('Too little remaining pilot time to train/evaluate safely')
        if combined:
            run([python,str(material/'combined_sweep.py'),str(output),'--steps',str(steps),'--max-seconds',str(train_seconds)],'combined_model_comparison',limit=train_seconds+20,env=environment)
        elif semantic:
            run([python,str(material/'semantic_sweep.py'),str(output),'--steps',str(steps),'--max-seconds',str(train_seconds)],'semantic_isolated_comparison',limit=train_seconds+20,env=environment)
        elif targeted:
            run([python,str(material/'targeted_sweep.py'),str(output),'--steps',str(steps),'--max-seconds',str(train_seconds)],'targeted_grounding_comparison',limit=train_seconds+20,env=environment)
        elif span:
            run([python,str(material/'span_pilot.py'),str(output),'--steps',str(steps),'--max-seconds',str(train_seconds),'--model',span_model]+(['--train-only'] if span_train_only else []),'evidence_span_pilot',limit=train_seconds+20,env=environment)
        elif ablation:
            run([python,str(material/'ablation.py'),str(output),'--steps',str(steps),'--max-seconds',str(train_seconds)],'input_sampling_data_ablation',limit=train_seconds+20,env=environment)
        else:
            run([python,str(material/'train.py'),'--output',str(run_path),'--data',str(material/'data'),'--max-steps',str(steps),'--max-seconds',str(train_seconds),'--save-every','50','--require-gpu'],'train_and_validate',limit=train_seconds+20,env=environment)
        if not (run_path/'decision.json').exists():raise RuntimeError('Training saved but did not finish validation; checkpoint recovery required')
        # Keep held-out test unopened until a candidate has been selected on validation.
        if not span and not targeted and not semantic and not combined:
            evaluation_data=output/'selected-data' if ablation else material/'data'
            run([python,str(material/'export.py'),str(run_path),'--data',str(evaluation_data)],'export_onnx',limit=100,env=environment)
            run([python,str(material/'evaluate.py'),str(run_path),'--data',str(evaluation_data),'--split','validation','--onnx'],'validate_int8',limit=60,env=environment)
        update('complete',status='complete')
    except BaseException as error:
        update('failed',status='failed',error_type=type(error).__name__,error=str(error))
        raise
    finally:
        # Recover complete and partial results. Exclude environment and HF cache.
        recovery=Path(str(output)+'-results.zip')
        with zipfile.ZipFile(recovery,'w',zipfile.ZIP_STORED) as archive:
            for name in ['status.json','hardware.json','ablation-report.json','targeted-report.json','targeted-progress.json','semantic-report.json','semantic-progress.json','combined-report.json','combined-progress.json','selection-frozen.json','data-audit.json']:
                if (output/name).exists():archive.write(output/name,name)
            for item in (output/'run').rglob('*'):
                # Preserve weights/INT8; regenerate the large FP32 graph locally
                # for base-model pilots instead of transferring duplicate weights.
                skip_fp32=span and span_model=='base' and state.get('status')=='complete' and item.name=='model.onnx'
                skip_best=state.get('status')=='complete' and 'best-validation-model' in item.relative_to(output).parts
                if item.is_file() and not item.name.endswith('.partial') and not skip_fp32 and not skip_best:archive.write(item,item.relative_to(output))
            for item in (output/'baseline').glob('*.json'):
                archive.write(item,item.relative_to(output))
            for item in (output/'ablations').rglob('*'):
                # Successful comparisons retain every report, but only the
                # selected model. A failed run preserves partial checkpoints.
                if item.is_file() and (item.suffix=='.json' or not (output/'run'/'decision.json').exists()):
                    archive.write(item,item.relative_to(output))
            for item in (output/'selected-data').glob('*'):
                if item.is_file():archive.write(item,item.relative_to(output))
            if state.get('status')=='complete':
                for item,relative in supplemental_seed_files(output):archive.write(item,relative)
        parts=[]
        with recovery.open('rb') as source:
            while chunk:=source.read(16*1024*1024):
                target=Path(str(recovery)+f'.part{len(parts):03d}');target.write_bytes(chunk)
                parts.append({'name':target.name,'bytes':len(chunk),'sha256':hashlib.sha256(chunk).hexdigest()})
        with recovery.open('rb') as handle:
            archive_sha=hashlib.file_digest(handle,'sha256').hexdigest()
        manifest={'archive':recovery.name,'bytes':recovery.stat().st_size,'sha256':archive_sha,'parts':parts}
        Path(str(recovery)+'.manifest.json').write_text(json.dumps(manifest,indent=2))
        print('RECOVERY_ARCHIVE='+str(recovery),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--bundle',required=True);p.add_argument('--output',required=True);p.add_argument('--sha256',required=True);p.add_argument('--steps',type=int,default=200);p.add_argument('--max-seconds',type=int,default=900);p.add_argument('--python-version',choices=['3.12','3.13'],default='3.13');p.add_argument('--baseline-steps',type=int,default=0)
    group=p.add_mutually_exclusive_group();group.add_argument('--ablation',action='store_true');group.add_argument('--span',action='store_true');group.add_argument('--targeted',action='store_true');group.add_argument('--semantic',action='store_true');group.add_argument('--combined',action='store_true')
    p.add_argument('--span-model',choices=['tiny','base'],default='tiny')
    p.add_argument('--span-train-only',action='store_true')
    a=p.parse_args()
    if not 1<=a.steps<=(1500 if a.targeted or a.combined else 5000 if a.span else 1000) or not 60<=a.max_seconds<=(2100 if a.combined else 2000 if a.semantic else 1200) or not 0<=a.baseline_steps<a.steps:raise SystemExit('Invalid bounded pilot settings')
    if a.span_train_only and not a.span:raise SystemExit('--span-train-only requires --span')
    execute(a.bundle,a.output,a.sha256,a.steps,a.max_seconds,a.python_version,a.baseline_steps,a.ablation,a.span,a.span_model,a.span_train_only,a.targeted,a.semantic,a.combined)
