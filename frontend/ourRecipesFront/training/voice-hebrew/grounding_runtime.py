"""Native CPU turn latency and frozen GPU-output parity; never accuracy scoring."""
import argparse
import copy
import gc
import json
import os
from pathlib import Path
import platform
import resource
import statistics
import time
from corpus import load_data
from engine import compose
from span_pilot import encode,infer


def run(folder,data,expected_trace,output,repeats=3):
    import torch
    from transformers import AutoTokenizer,AutoModelForTokenClassification
    torch.set_num_threads(2)
    folder=Path(folder);cfg=json.loads((folder/'run-config.json').read_text())
    expected=json.loads(Path(expected_trace).read_text());cases=expected['cases']
    threshold=json.loads((folder/'research-decision.json').read_text())['threshold']
    if expected['threshold']!=threshold:raise ValueError('Expected outputs use a different threshold')
    # Fixed positions across an already evaluated validation set, no test access.
    cases=[cases[i*len(cases)//16] for i in range(16)]
    recs,rows=load_data(Path(data));lookup={r['id']:r for r in rows if r['split']=='validation'}
    rows=[copy.deepcopy(lookup[c['id']]) for c in cases]
    for row in rows:row['gold']={'intent':'clarify','changes':[]}
    start=time.perf_counter()
    tok=AutoTokenizer.from_pretrained(folder/'model',local_files_only=True)
    model=AutoModelForTokenClassification.from_pretrained(folder/'model',local_files_only=True,attn_implementation='eager').eval()
    load_seconds=time.perf_counter()-start
    def turn(row):
        items=encode(tok,recs[row['recipe_id']],row,cfg['span_profile'])
        records=infer(model,tok,items,'cpu');actual=compose(records,threshold)
        by={r['action_id']:r for r in records if r['task']=='action'}
        for change in actual['changes']:change['evidence']=by[change['actionId']]['evidence']
        return actual,len(items)
    start=time.perf_counter();turn(rows[0]);first_seconds=time.perf_counter()-start
    durations=[];mismatches=set();query_counts=set()
    for repeat in range(repeats):
        for row,case in zip(rows,cases):
            start=time.perf_counter();actual,n=turn(row);durations.append((time.perf_counter()-start)*1000)
            query_counts.add(n)
            if actual!=case['actual']:mismatches.add(row['id'])
    ordered=sorted(durations)
    result={'scope':'Real native CPU in cloud workspace; known validation-output parity and turn latency only, no gold accuracy scoring, browser or physical user-device claim',
        'arm_profile':cfg['span_profile'],'seed':cfg['seed'],'threads':2,'logical_cpus':os.cpu_count(),
        'affinity_cpus':len(os.sched_getaffinity(0)),'platform':platform.platform(),'python':platform.python_version(),
        'cpu_model':next((line.split(':',1)[1].strip() for line in Path('/proc/cpuinfo').read_text().splitlines() if line.startswith('model name')),None),
        'cgroup_cpu_max':Path('/sys/fs/cgroup/cpu.max').read_text().strip(),
        'torch':torch.__version__,'threshold':threshold,'load_seconds_excluding_imports':load_seconds,
        'first_turn_ms':1000*first_seconds,'warm_repeats':repeats,'turns_per_repeat':16,'queries_per_turn':sorted(query_counts),
        'warm_median_ms':statistics.median(durations),'warm_p95_ms':ordered[min(len(ordered)-1,int(.95*len(ordered)))],
        'warm_min_ms':min(durations),'warm_max_ms':max(durations),'process_peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,
        'parity_examples':16,'proposal_mismatches':len(mismatches),'mismatch_ids':sorted(mismatches),
        'timing_includes':'Tokenization, all candidate/intent BERT queries as one turn batch, evidence decoder and composition; model already resident',
        'new_test_scored':False,'physical_device_tested':False}
    Path(output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    del model;gc.collect();return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('run');p.add_argument('data');p.add_argument('expected_trace');p.add_argument('output');p.add_argument('--repeats',type=int,default=3);a=p.parse_args()
    if not 1<=a.repeats<=5:raise SystemExit('Bounded repeats only')
    print(json.dumps(run(a.run,a.data,a.expected_trace,a.output,a.repeats),ensure_ascii=False))
