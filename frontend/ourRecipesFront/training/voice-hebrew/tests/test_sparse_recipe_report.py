import copy
import json
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sparse_recipe_data_v3 import build
from sparse_recipe_report import incorrect_mutations


class MutationAuditTests(unittest.TestCase):
    def setUp(self):
        self.row = copy.deepcopy(build()['splits']['validation'][0])
        self.ids = [a['id'] for a in self.row['input']['recipe']['actions']]
        self.row['input']['progress'] = {i: 'pending' for i in self.ids}
        self.row['expected']['facts'] = [{'action': self.ids[0], 'status': 'done'}]

    def text(self, facts):
        return json.dumps({'intent': 'report' if facts else 'other', 'facts': facts, 'clarify': []})

    def test_omission_does_not_become_an_incorrect_mutation(self):
        self.assertEqual(incorrect_mutations(self.row, self.text([])), [])

    def test_unexpected_confirmation_of_existing_state_does_not_become_mutation(self):
        self.row['input']['progress'][self.ids[1]] = 'done'
        self.assertEqual(incorrect_mutations(self.row, self.text([{'action': self.ids[1], 'status': 'done'}])), [])

    def test_actual_wrong_change_is_counted_and_valid_change_is_not(self):
        output = self.text([{'action': self.ids[0], 'status': 'done'}, {'action': self.ids[1], 'status': 'done'}])
        self.assertEqual(incorrect_mutations(self.row, output), [self.ids[1]])
        self.assertEqual(incorrect_mutations(self.row, 'invalid'), [])


if __name__ == '__main__':
    unittest.main()
