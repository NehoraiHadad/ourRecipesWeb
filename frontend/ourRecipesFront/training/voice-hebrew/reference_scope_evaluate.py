"""One-shot fresh scope evaluation; consumed 736-case test is never rerun here."""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import statistics
import time
from corpus import ROOT, digest
from reference_contract import reference_branch
from reference_data import normalize
from reference_train import actuals, build_head, features, metrics, predicts
from span_pilot import encode, grounded, infer


def native_turn(model, tok, head, recipe, row, threshold, profile, base_threshold):
    from engine import compose
    mode, confidence = predicts(head, [row['utterance']], features(model, tok, [row['utterance']]))[row['utterance']]
    proposal = reference_branch(recipe, {'recipe_id': row['recipe_id'], **row['state']}, mode, confidence, row['utterance'], threshold)
    if proposal is not None:
        return proposal
    clean = deepcopy(row)
    clean['gold'] = {'intent': 'clarify', 'changes': []}
    records = infer(model, tok, encode(tok, recipe, clean, profile), 'cpu')
    proposal = compose(records, base_threshold)
    lookup = {r['action_id']: r for r in records if r['task'] == 'action'}
    for change in proposal['changes']:
        change['evidence'] = lookup[change['actionId']]['evidence']
    return proposal


def run(folder):
    import torch
    from transformers import AutoModelForTokenClassification, AutoTokenizer
    from corpus import load_data
    torch.set_num_threads(2)
    folder = Path(folder)
    result = json.loads((folder/'result.json').read_text())
    if not result['all_qualified']:
        raise ValueError('Both fixed seeds must pass validation before fresh scope')
    for name, sha in result['plan']['source_sha256'].items():
        if digest((ROOT/name).read_bytes()) != sha:
            raise ValueError('Selected source changed: '+name)
    scope_plan = json.loads((ROOT/'verification/reference-scope-plan-20261112.json').read_text())
    fixtures_path = ROOT/'verification/reference-scope-fixtures-20261112.json'
    assert digest(fixtures_path.read_bytes()) == scope_plan['fixtures_sha256']
    assert digest((ROOT/'reference_scope.py').read_bytes()) == scope_plan['source_sha256']
    fixture = json.loads(fixtures_path.read_text())
    rows = fixture['rows']; recs = {r['id']: r for r in fixture['recipes']}
    training = json.loads((folder/'training.json').read_text())
    assert not {normalize(r['text']) for r in training} & {normalize(r['utterance']) for r in rows}
    base = ROOT/'runs/colab-state-v12/recovered/ablations/control-42/run'
    with (base/'model/model.safetensors').open('rb') as stream:
        body_sha = hashlib.file_digest(stream, 'sha256').hexdigest()
    assert body_sha == result['plan']['body_sha256']
    selection = {'created_utc': datetime.now(timezone.utc).isoformat(), 'scope': 'Frozen R4 before any fresh96 inference; seed42 primary,17 secondary',
        'body_sha256': body_sha, 'fixtures_sha256': scope_plan['fixtures_sha256'],
        'acceptance': 'Each seed: zero false updates, recall>=.75 and all other/ambiguous/zero cases clarify. Defined before this inference, after validation.',
        'variants': [{**v, 'head_sha256': digest((folder/f"head-{v['seed']}.pt").read_bytes())} for v in result['variants']]}
    target = folder/'scope-test-once'; target.mkdir(exist_ok=False)
    (target/'selection-frozen.json').write_text(json.dumps(selection, indent=2)+'\n')
    (ROOT/'verification/reference-scope-selection-20261112.json').write_text(json.dumps(selection, indent=2)+'\n')
    model = AutoModelForTokenClassification.from_pretrained(base/'model', local_files_only=True, attn_implementation='eager').eval()
    for parameter in model.parameters(): parameter.requires_grad_(False)
    tok = AutoTokenizer.from_pretrained(base/'model', local_files_only=True)
    profile = json.loads((base/'run-config.json').read_text())['span_profile']
    base_threshold = json.loads((base/'research-decision.json').read_text())['threshold']
    valid_recs, all_rows = load_data(ROOT/'runs/state-v13-preflight/shared')
    valid = [r for r in all_rows if r['split']=='validation']; sample = [valid[i*len(valid)//16] for i in range(16)]
    parity = []; heads = {}
    for variant in result['variants']:
        seed = variant['seed']; head = build_head(); head.load_state_dict(torch.load(folder/f'head-{seed}.pt', weights_only=True)); head.eval(); heads[seed] = head
        expected = {c['id']: c['actual'] for c in json.loads((folder/f'validation-{seed}.json').read_text())['cases']}
        durations = []; mismatches = []
        for row in sample:
            start = time.perf_counter()
            proposal = native_turn(model, tok, head, valid_recs[row['recipe_id']], row, variant['threshold'], profile, base_threshold)
            durations.append(1000*(time.perf_counter()-start))
            if proposal != expected[row['id']]: mismatches.append(row['id'])
        parity.append({'seed': seed, 'examples': len(sample), 'mismatches': mismatches, 'median_ms': statistics.median(durations), 'p95_ms': max(durations),
            'scope': 'Actual native mixed turns, cloud CPU2 threads, no warmup/repeats; gold removed; no phone/browser/audio measurement'})
    (target/'native-validation-parity.json').write_text(json.dumps(parity, indent=2)+'\n')
    if any(p['mismatches'] for p in parity): raise ValueError('Native path disagrees with validation composition; fresh scope not opened')
    texts = list(dict.fromkeys(r['utterance'] for r in rows))
    x = features(model, tok, texts)
    clean = deepcopy(rows)
    for row in clean: row['gold'] = {'intent': 'clarify', 'changes': []}
    items = [item for row in clean for item in encode(tok, recs[row['recipe_id']], row, profile)]
    print(json.dumps({'phase': 'fresh96_native_baseline_once', 'examples': len(rows), 'distinct_texts': len(texts), 'queries': len(items)}), flush=True)
    baseline_metrics = grounded(rows, infer(model, tok, items, 'cpu'), base_threshold)
    baseline = {c['id']: c['actual'] for c in baseline_metrics['cases']}
    (target/'baseline.json').write_text(json.dumps(baseline_metrics, ensure_ascii=False, indent=2)+'\n')
    trials = []
    for variant in result['variants']:
        seed = variant['seed']; prediction = predicts(heads[seed], texts, x)
        scored = metrics(rows, recs, actuals(rows, recs, prediction, baseline, variant['threshold']))
        (target/f'head-{seed}.json').write_text(json.dumps({'predictions': prediction, 'metrics': scored}, ensure_ascii=False, indent=2)+'\n')
        cases = {c['id']: c for c in scored['cases']}
        # Compare proposals without evidence metadata: exact intent and action/polarity.
        no_update_rows = [r for r in rows if not r['gold']['changes']]
        safe_clarify = sum(cases[r['id']]['actual']['intent']=='clarify' and not cases[r['id']]['actual']['changes'] for r in no_update_rows)
        accepted = scored['false_updates']==0 and scored['update_recall']>=.75 and safe_clarify==len(no_update_rows)
        trials.append({'seed': seed, 'threshold': variant['threshold'], 'accepted': accepted, 'required_clarifications': len(no_update_rows), 'actual_safe_clarifications': safe_clarify,
            'metrics': {k:v for k,v in scored.items() if k not in ('cases', 'by_scenario')}})
    known_text = 'עכשיו גם הדבר היחיד שעוד לא הושלם בשלב הזה בוצע'
    kx = features(model, tok, [known_text])
    known = {str(v['seed']): predicts(heads[v['seed']], [known_text], kx)[known_text] for v in result['variants']}
    proof = {'scope': 'Fresh24 authored wordings x4 contexts. Actual native frozen body/head and baseline; deterministic state binding; no real audio/device/human evaluation.',
        'selection': selection, 'training_seconds': result['seconds'], 'native_parity': parity, 'fresh_scope_once': trials,
        'all_accepted': all(t['accepted'] for t in trials), 'known_consumed_failure_regression': {'text': known_text, 'predictions': known, 'note': 'Diagnostic only, consumed736 test not rerun; below-threshold reference now clarifies.'},
        'head_parameters': sum(p.numel() for p in build_head().parameters()), 'head_bytes': {str(v['seed']):(folder/f"head-{v['seed']}.pt").stat().st_size for v in result['variants']},
        'physical_device_tested': False, 'human_reviewed': False, 'production_ready': False, 'original120_scored': False}
    (ROOT/'verification/reference-scope-results-20261112.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2)+'\n')
    print('FRESH_SCOPE_DONE', json.dumps(proof, ensure_ascii=False), flush=True)
    return proof


if __name__=='__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('folder'); args = parser.parse_args(); run(args.folder)
