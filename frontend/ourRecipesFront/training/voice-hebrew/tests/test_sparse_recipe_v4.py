import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sparse_recipe_data_v4 import build, messages, SYSTEM, COUNTS, OLD
from sparse_recipe_v3 import validate
from sparse_recipe_study_v4 import decision


class DataInterventionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = build()['splits']

    def test_control_and_regression_are_byte_equivalent_values(self):
        old = json.loads(OLD.read_text())['splits']
        self.assertEqual(self.data['control_train'], old['train'])
        self.assertEqual(self.data['regression'], old['validation'])
        self.assertEqual([len(self.data[k]) for k in ['control_train', 'diverse_train', 'development', 'regression']], [360, 360, 160, 120])

    def test_exact_inputs_disjoint_and_no_regression_utterance_used_for_training(self):
        serial = lambda r: json.dumps(r['input'], sort_keys=True, ensure_ascii=False)
        train = {serial(r) for r in self.data['control_train'] + self.data['diverse_train']}
        self.assertFalse(train & {serial(r) for r in self.data['development']})
        regression_text = {r['input']['utterance'] for r in self.data['regression']}
        self.assertFalse(regression_text & {r['input']['utterance'] for r in self.data['diverse_train']})
        for row in self.data['diverse_train'] + self.data['development']:
            self.assertEqual(validate(row['expected'], row['input']), row['expected'])

    def test_four_cells_and_matched_pairs_change_only_language(self):
        rows = self.data['development']
        cells = {r['cell'] for r in rows}; self.assertEqual(len(cells), 4)
        for cell in cells:
            subset = [r for r in rows if r['cell'] == cell]
            self.assertEqual(len(subset), 40)
            self.assertEqual({f: sum(r['family'] == f for r in subset) for f in COUNTS}, {f: 4 for f in COUNTS})
        pairs = {r['pair_id'] for r in rows}; self.assertEqual(len(pairs), 80)
        for pair in pairs:
            a, b = [r for r in rows if r['pair_id'] == pair]
            self.assertEqual(a['expected'], b['expected'])
            for key in ['recipe', 'progress', 'currentStep', 'history']:
                self.assertEqual(a['input'][key], b['input'][key])
            self.assertNotEqual(a['input']['utterance'], b['input']['utterance'])

    def test_unseen_recipes_are_absent_from_both_train_arms(self):
        train = {r['input']['recipe']['id'] for r in self.data['control_train'] + self.data['diverse_train']}
        for row in self.data['development']:
            self.assertEqual(row['input']['recipe']['id'] in train, row['cell'].startswith('seen-recipe/'))

    def test_common_prompt_is_identical_and_contains_no_gold(self):
        a = copy.deepcopy(self.data['development'][0]); before = messages(a)
        a['expected'] = {'secret': 'GOLD'}; a['frame'] = 'GOLD'; a['cell'] = 'GOLD'
        self.assertEqual(messages(a), before)
        self.assertEqual(before[0]['content'], SYSTEM)
        self.assertIn('מיקום ניווט בלבד', SYSTEM)
        self.assertEqual(json.loads(before[1]['content']), a['input'])

    def test_gate_requires_hard_cell_gain_coverage_and_no_critical_false_facts(self):
        control = {'primary': {'exact': 28, 'required_changes': 20, 'required_changes_correct': 16},
                   'regression': {'exact': 90, 'critical_wrong_fact_cases': 2}}
        diverse = {'primary': {'exact': 32, 'required_changes': 20, 'required_changes_correct': 16},
                   'regression': {'exact': 84, 'critical_wrong_fact_cases': 2},
                   'all_development': {'critical_wrong_fact_cases': 0}}
        self.assertTrue(decision(control, diverse)['data_intervention_gate_passed'])
        for path, value in [('exact', 31), ('required_changes_correct', 15)]:
            bad = copy.deepcopy(diverse); bad['primary'][path] = value
            self.assertFalse(decision(control, bad)['data_intervention_gate_passed'])
        bad = copy.deepcopy(diverse); bad['all_development']['critical_wrong_fact_cases'] = 1
        self.assertFalse(decision(control, bad)['data_intervention_gate_passed'])

    def test_gate_rejects_old_regression_collapse_or_more_false_facts(self):
        control = {'primary': {'exact': 20}, 'regression': {'exact': 90, 'critical_wrong_fact_cases': 2}}
        diverse = {'primary': {'exact': 36, 'required_changes': 20, 'required_changes_correct': 18},
                   'regression': {'exact': 83, 'critical_wrong_fact_cases': 2},
                   'all_development': {'critical_wrong_fact_cases': 0}}
        self.assertFalse(decision(control, diverse)['data_intervention_gate_passed'])
        diverse['regression'] = {'exact': 90, 'critical_wrong_fact_cases': 3}
        self.assertFalse(decision(control, diverse)['data_intervention_gate_passed'])


if __name__ == '__main__':
    unittest.main()
