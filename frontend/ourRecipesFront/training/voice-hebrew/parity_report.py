"""Summarize a frozen local native/WASM development comparison, not a phone test."""
import argparse
import hashlib
import json
from pathlib import Path
from statistics import median


def summarize(path):
    result = json.loads(path.read_text())
    comparisons = result.get('comparison', [])
    structured = [c for c in comparisons if c['kind'] == 'structured']
    metrics = {}
    differences = []
    update_matches = 0
    for comparison in comparisons:
        native = next(r for r in result['native'] if r['id'] == comparison['id'])
        browser = next(r for r in result['browser'] if r['id'] == comparison['id'])
        updates_equal = None
        if comparison['kind'] == 'structured':
            try:
                updates_equal = json.loads(native['text'])['updates'] == json.loads(browser['text'])['updates']
                update_matches += int(updates_equal)
            except (ValueError, KeyError):
                updates_equal = False
        if not comparison['generatedTokensExact']:
            n, b = native.get('tokens') or [], browser.get('tokens') or []
            index = next((i for i, (x, y) in enumerate(zip(n, b)) if x != y), min(len(n), len(b)))
            entry = {'id': comparison['id'], 'first_differing_generated_index': index,
                     'native_text': native['text'], 'browser_text': browser['text'],
                     'parsed_updates_equal': updates_equal}
            for name, row in [('native', native), ('browser', browser)]:
                probs = (row['response']['choices'][0].get('logprobs') or {}).get('content', [])
                entry[name + '_first_divergence_probabilities'] = probs[index] if index < len(probs) else None
            differences.append(entry)
    for backend in ('native', 'browser'):
        rows = [r for r in result[backend] if r['kind'] == 'structured']
        evaluations = [c[backend + 'Evaluation'] for c in structured]
        metrics[backend] = {
            'structured_cases': len(rows),
            'structurally_valid': sum(e['structurallyValid'] for e in evaluations),
            'correct_final_state': sum(e.get('expectedFinalState', False) for e in evaluations),
            'exact_reported_facts': sum(e.get('exactReportedFacts', False) for e in evaluations),
            'median_structured_ms': median([r['ms'] for r in rows]) if rows else None,
            'max_structured_ms': max([r['ms'] for r in rows], default=None),
        }
        # These five frozen V19 fixtures require an effective state change.
        change_ids = {'flour-next', 'water-not-mixed', 'correction', 'unrelated-doubt', 'partial-water'}
        metrics[backend]['required_changes_correct'] = sum(
            c[backend + 'Evaluation'].get('expectedFinalState', False)
            for c in structured if c['id'] in change_ids)
        metrics[backend]['required_change_cases'] = sum(c['id'] in change_ids for c in structured)
        metrics[backend]['readonly_final_states_correct'] = sum(
            c[backend + 'Evaluation'].get('expectedFinalState', False)
            for c in structured if c['id'] not in change_ids)
        metrics[backend]['readonly_cases'] = sum(c['id'] not in change_ids for c in structured)
    return {
        'result_file': str(path),
        'result_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'completed': result['completed'],
        'error': result.get('error'),
        'compared_cases': len(comparisons),
        **{key: sum(c[key] for c in comparisons) for key in (
            'promptExact', 'nativeRenderedMatchesActual', 'promptCountMatches',
            'generatedTokensExact', 'textExact')},
        'metrics': metrics,
        'structured_update_arrays_equal': update_matches,
        'generated_sequence_differences': differences,
        'forced_prefix_diagnostics': len(result.get('diagnostics', [])),
        'blocked_external_browser_requests': len(result.get('externalBrowserRequestsBlocked', [])),
        'physical_device_tested': False,
        'training_performed': False,
        'held_tests_inferred': False,
        'notes': [
            'Two backends see the same 14 authored development requests, not 28 independent quality cases.',
            'Native data may be reused from the retained v2 run after browser transport-only fixes.',
            'Actual prompt strings, counts and generated IDs are observed. WASM input IDs are not directly exposed.',
            'Native and WASM use different CPU kernels. Equality on these cases is not universal numerical parity.',
            'Times are local diagnostics, not controlled speed or physical-phone benchmarks.',
            'Model inference uses the old V19 contract, not the new 80-case contract dataset.',
        ],
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('result', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    text = json.dumps(summarize(args.result), ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.write_text(text)
    print(text)
