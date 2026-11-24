"""Run from the frontend checkout with npm dependencies, playwright and Chromium installed."""
import argparse, functools, hashlib, http.server, json, math, os, random, re, shutil, statistics, subprocess, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
from cases import CASES, RECIPES
from dialogues import DIALOGUES

here = Path(__file__).resolve().parent
root = here.parents[1]
arms = ['short', 'full', 'shortState', 'fullState', 'structured', 'focused']

class Assets(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()

def meets_expectations(case, result):
    reply = result['reply']
    return (all(re.search(pattern,reply) for pattern in case['yes'])
            and not any(re.search(pattern,reply) for pattern in case['no'])
            and sorted(result['writes']) == sorted(case['writes']) and not result['proposal'])

def main(output, repeats, compare_portions=False):
    modes_to_test = ['focused','portions'] if compare_portions else arms
    if compare_portions:
        from portion_dialogues import FRESH, FRESH_RECIPES
        from portion_holdout import HOLDOUT
    rows = []
    rng = random.Random(82)
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as pw:
        path = Path(tmp)
        (path/'voice').symlink_to(root/'public/voice', target_is_directory=True)
        (path/'index.html').write_text('<!doctype html><meta charset=utf-8><script type=module src=/compare.mjs></script>')
        subprocess.run([root/'node_modules/.bin/esbuild', here/'compare.mjs','--bundle','--format=esm','--outfile='+str(path/'compare.mjs')],cwd=root,check=True)
        httpd = http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Assets,directory=tmp))
        threading.Thread(target=httpd.serve_forever,daemon=True).start()
        browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM') or shutil.which('chromium'))
        page = browser.new_page()
        page.goto('http://127.0.0.1:'+str(httpd.server_port))
        cold = page.evaluate('async()=>{const t=performance.now();await boot(); return performance.now()-t;}')
        recipes = page.evaluate('setupRecipes',RECIPES | (FRESH_RECIPES if compare_portions else {}))
        def run(arm,case):
            return page.evaluate('args=>trial(...args)',[arm,case,recipes[case['recipe']]])
        # Warm up the worker before timing. Interleave paired arms independently per checkpoint.
        run('short', next(c for c in CASES if c['id']=='pronoun_milk'))
        for n in range(repeats):
            order = list(CASES)
            rng.shuffle(order)
            for case in order:
                modes = modes_to_test.copy()
                rng.shuffle(modes)
                for arm in modes:
                    r = run(arm,case)
                    rows.append(dict(arm=arm,case=case['id'],repeat=n,correct=meets_expectations(case,r),**r))
            print('completed pass',n+1,flush=True)
        dialogues = []
        for num, dialogue in enumerate(DIALOGUES + (FRESH + HOLDOUT if compare_portions else [])):
            for arm in modes_to_test:
                state, history, portions = {}, [], {}
                for case in dialogue:
                    checkpoint = dict(case,state=state,history=history,portions=portions)
                    result = run(arm,checkpoint)
                    dialogues.append(dict(dialogue=num+1,arm=arm,case=case['id'],correct=meets_expectations(case,result),**result))
                    if result['proposal']:
                        # The script gives no implicit confirmation. The app does not save a proposal.
                        continue
                    state.update(dict(result['writes']))
                    portions = result.get('portions', {})
                    history += [dict(role='user',content=case['text']),dict(role='assistant',content=result['reply'])]
        # Hold the recipe, stored state and utterance constant to isolate history length.
        probe = next(c for c in CASES if c['id']=='long_substitution_control')
        lengths = [0, 4, 8, 12, 16, 24, len(probe['history'])]
        sweep = []
        for n in range(repeats):
            pairs = [] if compare_portions else [(size,arm) for size in lengths for arm in ('full','fullState')]
            rng.shuffle(pairs)
            for size, arm in pairs:
                checkpoint = dict(probe,history=probe['history'][:size])
                result = run(arm,checkpoint)
                sweep.append(dict(messages=size,arm=arm,repeat=n,correct=meets_expectations(checkpoint,result),**result))
        chromium = browser.version
        browser.close()
        httpd.shutdown()
    def latency(values):
        ordered = sorted(values)
        return {'n':len(values),'median_ms':round(statistics.median(values),2),'p95_ms':round(ordered[math.ceil(.95*len(values))-1],2)} if values else {}
    summary = {}
    for arm in modes_to_test:
        sample = [r for r in rows if r['arm']==arm]
        misses = sorted(set(r['case'] for r in sample if not r['correct']))
        worker = [r for r in sample if r['route']=='worker']
        summary[arm] = dict(correct=len(CASES)-len(misses),cases=len(CASES),misses=misses,
            unexpected_writes=sorted({r['case'] for r in sample if set(map(tuple,r['writes']))-set(map(tuple,next(c for c in CASES if c['id']==r['case'])['writes']))}),
            latency=latency([r['ms'] for r in sample]), worker_latency=latency([r['ms'] for r in worker]),
            skipped_encoder=sorted({r['case'] for r in worker if r['calls']==0}))
    for arm in modes_to_test:
        turns = [r for r in dialogues if r['arm']==arm]
        summary[arm]['dialogue_turns_correct'] = sum(r['correct'] for r in turns)
        summary[arm]['dialogue_turns_total'] = len(turns)
        summary[arm]['complete_dialogues'] = sum(all(r['correct'] for r in turns if r['dialogue']==i+1) for i in range(len(DIALOGUES)))
    out={'build':'5a62688f1e85071091203892b0d99a77e175c400','chromium':chromium,'cold_worker_ms':round(cold,1),
         'cases_sha256':hashlib.sha256((here/'cases.py').read_bytes()).hexdigest(),'repeats':repeats,'summary':summary,'rows':rows,'dialogues':dialogues,'history_length_probe':sweep}
    if compare_portions:
        # The old test asked the assistant to say it had forgotten an explicitly reported half.
        # Preserve that score for comparison. Also grade both arms against the new requirement.
        known_amount = dict(DIALOGUES[0][-1],yes=['חלב','1 כוס חלב|כוס אחת|כוס חלב אחת'],no=['לא תועד'])
        for r in dialogues:
            r['current_correct'] = meets_expectations(known_amount,r) if r['case']=='milk_remaining' else r['correct']
        for arm in modes_to_test:
            for name,numbers in [('replay',range(1,5)),('fresh',range(5,5+len(FRESH))),('holdout',range(5+len(FRESH),5+len(FRESH)+len(HOLDOUT)))]:
                group=[r for r in dialogues if r['arm']==arm and r['dialogue'] in numbers]
                summary[arm][name] = dict(passed=sum(r['current_correct'] for r in group),total=len(group),
                    whole=sum(all(r['current_correct'] for r in group if r['dialogue']==i) for i in numbers),dialogs=len(numbers))
            turns = [r for r in dialogues if r['arm']==arm]
            summary[arm]['dialogue_turns_correct'] = sum(r['current_correct'] for r in turns)
            summary[arm]['complete_dialogues'] = sum(summary[arm][name]['whole'] for name in ('replay','fresh','holdout'))
            targets = {case['id']:case['writes'] for group in DIALOGUES+FRESH+HOLDOUT for case in group}
            summary[arm]['unexpected_dialogue_writes'] = [
                r['case'] for r in turns if set(map(tuple,r['writes'])) - set(map(tuple,targets[r['case']]))]
        out['candidate_sha256']=hashlib.sha256((here/'portions.mjs').read_bytes()).hexdigest()
        out['holdout_sha256']=hashlib.sha256((here/'portion_holdout.py').read_bytes()).hexdigest()
        out['fresh_sha256']=hashlib.sha256((here/'portion_dialogues.py').read_bytes()).hexdigest()
    output.write_text(json.dumps(out,ensure_ascii=False,indent=1)+'\n')
    print(json.dumps(summary,ensure_ascii=False,indent=1))

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--repeats',type=int,default=3)
    ap.add_argument('--compare-portions',action='store_true')
    args=ap.parse_args()
    main(args.output,args.repeats,args.compare_portions)
