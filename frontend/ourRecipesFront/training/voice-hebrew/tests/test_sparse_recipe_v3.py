import copy
import json
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sparse_recipe_data_v3 import build
from sparse_recipe_v3 import aggregate, messages, parse, score, validate


class SparseContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = build()['splits']

    def test_new_partitions_are_disjoint_and_balanced(self):
        train, val = self.data['train'], self.data['validation']
        self.assertEqual((len(train), len(val)), (360, 120))
        for extract in [lambda r: r['id'], lambda r: r['input']['recipe']['id'],
                        lambda r: r['input']['utterance']]:
            self.assertFalse({extract(r) for r in train} & {extract(r) for r in val})
        self.assertEqual(len({r['family'] for r in val}), 10)
        for row in train + val:
            self.assertEqual(validate(row['expected'], row['input']), row['expected'])
            self.assertEqual(row['critical_no_facts'], not row['expected']['facts'])

    def test_prompt_uses_only_request_and_current_recipe(self):
        row = copy.deepcopy(self.data['train'][0])
        original = messages(row)
        row['expected'] = {'sentinel': 'GOLD_LEAK'}
        row['family'] = 'GOLD_LEAK'
        self.assertEqual(messages(row), original)
        request = json.loads(original[1]['content'])
        self.assertEqual(set(request), {'recipe', 'progress', 'currentStep', 'history', 'utterance'})
        self.assertNotIn('expected', original[1]['content'])

    def test_invalid_outputs_never_become_successful_noops(self):
        rows = [next(r for r in self.data['validation'] if r['family'] == f) for f in ['question', 'clear']]
        summary, _ = aggregate(rows, ['not JSON', '{}'])
        self.assertEqual(summary['valid'], 0)
        self.assertEqual(summary['state_correct'], 0)
        self.assertEqual(summary['cases'], 2)
        self.assertEqual(summary['rejected_output'], 2)
        with self.assertRaises(ValueError):
            aggregate(rows, [])

    def test_duplicate_keys_unknown_actions_and_conflicting_clarifications_fail(self):
        row = self.data['train'][0]; request = row['input']; target = request['recipe']['actions'][0]['id']
        candidates = [
            '{"intent":"next","intent":"report","facts":[],"clarify":[]}',
            json.dumps({'intent': 'report', 'facts': [{'action': 'unknown', 'status': 'done'}], 'clarify': []}),
            json.dumps({'intent': 'report', 'facts': [{'action': target, 'status': 'done'}], 'clarify': [target]}),
            json.dumps({'intent': 'report', 'facts': [{'action': target, 'status': 'done'}] * 2, 'clarify': []}),
            '{"intent":"report","facts":[],"clarify":[]}',
        ]
        for text in candidates:
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse(text, request)

    def test_correct_outputs_score_without_mutating_explicit_state(self):
        snapshot = copy.deepcopy(self.data)
        for split, rows in self.data.items():
            summary, _ = aggregate(rows, [json.dumps(r['expected']) for r in rows])
            self.assertEqual(summary['exact'], len(rows), split)
            self.assertEqual(summary['required_changes_correct'], summary['required_changes'], split)
        self.assertEqual(self.data, snapshot)

    def test_partial_corrections_and_mixed_scope_remain_sparse(self):
        rows = self.data['validation']
        mixed = next(r for r in rows if r['family'] == 'multiple' and r['expected']['clarify'])
        self.assertEqual(len(mixed['expected']['facts']), 1)
        self.assertNotEqual(mixed['expected']['facts'][0]['action'], mixed['expected']['clarify'][0])
        correction = next(r for r in rows if r['family'] == 'correction' and r['expected']['facts'][0]['status'] == 'partial')
        f = correction['expected']['facts'][0]
        self.assertEqual(correction['input']['progress'][f['action']], 'done')
        self.assertTrue(score(correction, json.dumps(correction['expected']))['requires_change'])

    def test_noop_cannot_hide_missing_explicit_pending_report(self):
        row = copy.deepcopy(next(r for r in self.data['validation'] if r['family'] == 'negation'))
        f = row['expected']['facts'][0]; row['input']['progress'][f['action']] = 'pending'
        scored = score(row, '{"intent":"other","facts":[],"clarify":[]}')
        self.assertTrue(scored['state_correct'])
        self.assertFalse(scored['facts_exact'])
        self.assertFalse(scored['exact'])


if __name__ == '__main__':
    unittest.main()
