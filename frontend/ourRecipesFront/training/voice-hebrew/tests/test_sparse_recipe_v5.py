import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sparse_recipe_data_v5 import build
from sparse_recipe_study_v5 import retention
from sparse_recipe_v3 import validate
from sparse_recipe_language_probe_v5 import build as language_probe, messages as probe_messages


class ReplayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.data = build()['splits']

    def test_fixed_training_budget_and_origins(self):
        for arm, expected in [('control_train', {'old': 180, 'diverse': 180}),
                              ('diverse_train', {'old': 120, 'diverse': 120, 'counterfactual': 120})]:
            rows = self.data[arm]
            self.assertEqual(len(rows), 360); self.assertEqual(len({r['id'] for r in rows}), 360)
            self.assertEqual({origin: sum(r['training_origin'] == origin for r in rows) for origin in expected}, expected)
            for row in rows: validate(row['expected'], row['input'])

    def test_exposed_benchmarks_preserved_and_not_used_for_training(self):
        root = Path(__file__).resolve().parents[1]
        old = json.loads((root / 'verification/sparse-recipe-data-v4-20261116.json').read_text())['splits']
        for split in ['development', 'regression']: self.assertEqual(self.data[split], old[split])
        key = lambda r: json.dumps(r['input'], sort_keys=True, ensure_ascii=False)
        evaluation = {key(r) for r in self.data['development'] + self.data['regression']}
        for arm in ['control_train', 'diverse_train']:
            self.assertFalse(evaluation & {key(r) for r in self.data[arm]})

    def test_counterfactual_groups_hold_context_fixed_and_change_semantics(self):
        rows = [r for r in self.data['diverse_train'] if r['training_origin'] == 'counterfactual']
        groups = {r['counterfactual_group'] for r in rows}; self.assertEqual(len(groups), 24)
        for group in groups:
            cases = [r for r in rows if r['counterfactual_group'] == group]; self.assertEqual(len(cases), 5)
            contexts = [{k: v for k, v in r['input'].items() if k != 'utterance'} for r in cases]
            self.assertTrue(all(c == contexts[0] for c in contexts))
            self.assertEqual(len({r['input']['utterance'] for r in cases}), 5)
            self.assertEqual({f['status'] for r in cases for f in r['expected']['facts']}, {'done', 'pending', 'partial'})
            self.assertEqual(sum(bool(r['expected']['clarify']) for r in cases), 1)
            self.assertEqual(sum(r['critical_no_facts'] for r in cases), 2)

    def test_fit_probe_is_training_only_not_new_evaluation(self):
        for arm, probe in [('control_train', 'control_fit'), ('diverse_train', 'diverse_fit')]:
            self.assertEqual(len(self.data[probe]), 36)
            self.assertEqual(len({r['id'] for r in self.data[probe]}), 36)
            rows = {r['id']: r for r in self.data[arm]}
            for r in self.data[probe]: self.assertEqual(r, rows[r['id']])

    def test_retention_utility_does_not_replace_quality_gate(self):
        reference = {'all_development': {'exact': 133, 'critical_wrong_fact_cases': 2},
                     'primary': {'exact': 26, 'required_changes_correct': 16}}
        candidate = {'all_development': {'exact': 125, 'critical_wrong_fact_cases': 2},
                     'primary': {'exact': 26, 'required_changes_correct': 16},
                     'regression': {'exact': 81, 'critical_wrong_fact_cases': 5}}
        self.assertTrue(retention(candidate, reference))
        for group, key, value in [('all_development', 'exact', 124), ('primary', 'exact', 25),
                                  ('regression', 'exact', 80), ('regression', 'critical_wrong_fact_cases', 6)]:
            bad = copy.deepcopy(candidate); bad[group][key] = value
            self.assertFalse(retention(bad, reference))

    def test_language_probe_pairs_preserve_labels_and_do_not_leak_gold(self):
        probe = language_probe()
        self.assertEqual((len(probe['he']), len(probe['en'])), (16, 16))
        for he, en in zip(probe['he'], probe['en']):
            self.assertEqual(he['expected'], en['expected'])
            self.assertEqual(he['input']['progress'], en['input']['progress'])
            for lang, row in [('he', he), ('en', en)]:
                validate(row['expected'], row['input'])
                before = probe_messages(row, lang)
                changed = copy.deepcopy(row); changed['expected'] = {'secret': 'GOLD'}
                self.assertEqual(probe_messages(changed, lang), before)


if __name__ == '__main__': unittest.main()
