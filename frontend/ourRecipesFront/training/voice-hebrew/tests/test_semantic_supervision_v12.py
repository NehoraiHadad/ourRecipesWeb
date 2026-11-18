import copy
import importlib.util
import unittest

from semantic_supervision_data_v12 import audit, read_labels, read_native, validate_label
from semantic_supervision_train_v12 import microbatch, response_losses
from semantic_supervision_v12 import compare_at_endpoint, exposure, read_plan


class EditorialTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.splits = read_native()
        cls.labels = read_labels()
        cls.rows = {row['id']: row for row in cls.splits['train']}

    def test_full_frozen_train_coverage_and_contrasts(self):
        result = audit(self.splits, self.labels)
        self.assertEqual((result['labeled_rows'], result['pairs'], result['recipe_names']), (144, 72, 6))
        self.assertEqual(result['overlapping_recipe_id_version_pairs'], 0)
        self.assertEqual(result['overlapping_recipe_names']['diagnostic'], ['אורז', 'מרק עדשים'])
        self.assertEqual(len(exposure(read_plan(), len(self.rows))), 640)

    def test_invalid_evidence_or_certainty_is_rejected(self):
        label = next(label for label in self.labels if label['id'] == 'native-v10-r0-p0-v1')
        row = self.rows[label['id']]
        changed = copy.deepcopy(label)
        changed['target']['clauses'][0]['evidence'] = 'טקסט שהומצא'
        with self.assertRaisesRegex(ValueError, 'evidence'):
            validate_label(row, changed)
        changed = copy.deepcopy(label)
        changed['target']['clauses'][0].update(stance='asserted', status='done')
        with self.assertRaises(ValueError):
            validate_label(row, changed)
        changed = copy.deepcopy(label)
        changed['recipe'][1] = 'different-version'
        with self.assertRaisesRegex(ValueError, 'recipe revision'):
            validate_label(row, changed)

    def test_identical_utterance_has_different_history_binding(self):
        resolved, ambiguous = [next(label for label in self.labels if label['id'] == f'native-v10-r0-p10-v{i}')
                               for i in (0, 1)]
        self.assertEqual(resolved['target']['clauses'][0]['evidence'], ambiguous['target']['clauses'][0]['evidence'])
        self.assertIsNotNone(resolved['target']['clauses'][0]['action'])
        self.assertIsNone(ambiguous['target']['clauses'][0]['action'])
        changed = copy.deepcopy(ambiguous)
        changed['history']['candidates'] = resolved['history']['candidates']
        with self.assertRaisesRegex(ValueError, 'History candidates'):
            validate_label(self.rows[changed['id']], changed)


class EndpointTests(unittest.TestCase):
    def test_requires_improvement_at_fixed_endpoint_and_no_added_wrong_facts(self):
        control = {'step': 160, 'primary': {'exact': 28},
                   'all_development': {'cases_with_wrong_facts': 8},
                   'regression': {'exact': 100, 'critical_wrong_fact_cases': 7, 'cases_with_wrong_facts': 9}}
        candidate = {'step': 160, 'primary': {'exact': 32, 'required_changes_correct': 19, 'required_changes': 23},
                     'all_development': {'exact': 123, 'critical_wrong_fact_cases': 0, 'cases_with_wrong_facts': 8},
                     'regression': {'exact': 95, 'critical_wrong_fact_cases': 7, 'cases_with_wrong_facts': 9}}
        self.assertTrue(compare_at_endpoint(control, candidate, read_plan())['semantic_gate_passed'])
        candidate['regression']['cases_with_wrong_facts'] = 10
        self.assertFalse(compare_at_endpoint(control, candidate, read_plan())['semantic_gate_passed'])
        candidate['step'] = 80
        with self.assertRaisesRegex(ValueError, 'final update'):
            compare_at_endpoint(control, candidate, read_plan())


@unittest.skipUnless(all(importlib.util.find_spec(name) for name in ('torch', 'transformers', 'peft')),
                     'requires the frozen ML dependencies')
class LossTests(unittest.TestCase):
    def test_padding_shift_response_average_and_optimizer_update(self):
        import torch
        from peft import LoraConfig, get_peft_model
        from transformers import Qwen3Config, Qwen3ForCausalLM

        torch.manual_seed(42)
        config = Qwen3Config(vocab_size=64, hidden_size=32, intermediate_size=64, num_hidden_layers=1,
                             num_attention_heads=4, num_key_value_heads=2, head_dim=8)
        model = get_peft_model(Qwen3ForCausalLM(config),
                               LoraConfig(task_type='CAUSAL_LM', r=2, target_modules=['q_proj']))
        main = [
            {'input_ids': [1, 2, 3, 4], 'labels': [-100, -100, 3, 4], 'prompt_tokens': 2, 'target_tokens': 2},
            {'input_ids': [7, 8, 9, 10, 11, 4], 'labels': [-100, -100, -100, 10, 11, 4],
             'prompt_tokens': 3, 'target_tokens': 3},
        ]
        extra = {0: main[1]}
        with torch.no_grad():
            actual = response_losses(model, main, 0, 'cpu')
            expected = torch.stack([model(input_ids=torch.tensor([r['input_ids']]),
                                          labels=torch.tensor([r['labels']]), use_cache=False).loss for r in main])
        torch.testing.assert_close(actual, expected)
        trainable = [parameter for parameter in model.parameters() if parameter.requires_grad]
        frozen = [parameter for parameter in model.parameters() if not parameter.requires_grad]
        before = [parameter.detach().clone() for parameter in trainable]
        optimizer = torch.optim.AdamW(trainable, lr=0.001)
        outcome = microbatch(model, main, extra, [0, 1], 0, 'cpu', backward=lambda loss: loss.backward())
        self.assertAlmostEqual(outcome['primary_weighted'], (0.5 * expected[0] + expected[1]).item() / 2, places=6)
        self.assertAlmostEqual(outcome['second_weighted'], expected[1].item() / 4, places=6)
        self.assertTrue(all(parameter.grad is None for parameter in frozen))
        self.assertTrue(all(torch.isfinite(parameter.grad).all() for parameter in trainable))
        optimizer.step()
        self.assertTrue(any(not torch.equal(previous, after) for previous, after in zip(before, trainable, strict=True)))


if __name__ == '__main__':
    unittest.main()
