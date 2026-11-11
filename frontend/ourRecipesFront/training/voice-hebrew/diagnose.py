"""Inspect train/validation failures and candidate sensitivity; never score test."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
from corpus import ROOT, load_data
from engine import expand, infer, score, verify_manifest


def diagnose(run, output, data=ROOT / 'data'):
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    torch.set_num_threads(4)
    run, output = Path(run), Path(output)
    output.mkdir(parents=True, exist_ok=False)
    config = json.loads((run / 'run-config.json').read_text())
    manifest = verify_manifest(data)
    if config['corpus_sha256'] != manifest['corpus_sha256']:
        raise ValueError('Diagnostic corpus differs from training')
    model = AutoModelForSequenceClassification.from_pretrained(run / 'model', local_files_only=True, attn_implementation='eager')
    tokenizer = AutoTokenizer.from_pretrained(run / 'model', local_files_only=True)
    recs, rows = load_data(Path(data))
    report = {'input_contract': config['input_contract'], 'corpus_sha256': manifest['corpus_sha256'],
              'test_evaluated': False, 'human_reviewed': False, 'splits': {}}
    for split in ['train', 'validation']:
        records, timing = infer(model, tokenizer, expand(recs, rows, split, config['input_contract']), 'cpu', max_length=config['max_length'])
        selected = [r for r in rows if r['split'] == split]
        grouped = defaultdict(list)
        confusion = defaultdict(Counter)
        for q in records:
            confusion[q['task']][q['label'] + ' -> ' + q['prediction']] += 1
            if q['task'] == 'action':
                grouped[q['example_id']].append(q)
        mixed = [qs for qs in grouped.values() if len({q['label'] for q in qs}) > 1]
        same = sum(len({q['prediction'] for q in qs}) == 1 for qs in mixed)
        summary = score(selected, records, .5)
        summary.pop('cases')
        report['splits'][split] = {'timing': timing, 'metrics_at_0_5': summary,
            'raw_confusion': {k: dict(v) for k, v in confusion.items()},
            'mixed_gold_conversations': len(mixed), 'identical_action_predictions_on_mixed_gold': same}
        (output / f'{split}-records.json').write_text(json.dumps(records, ensure_ascii=False))
    (output / 'diagnostic.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return report


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('run'); p.add_argument('output'); p.add_argument('--data', type=Path, default=ROOT / 'data')
    a = p.parse_args(); diagnose(a.run, a.output, a.data)
