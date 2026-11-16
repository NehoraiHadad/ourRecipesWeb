import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sparse_recipe_reference_v6 import schema
from sparse_recipe_v3 import validate
from lmformatenforcer import JsonSchemaParser


class GrammarTests(unittest.TestCase):
    def test_all_expected_outputs_permitted(self):
        data = json.loads((Path(__file__).resolve().parents[1] / 'verification/sparse-recipe-data-v6-20261116.json').read_text())
        for rows in data.values():
            for row in rows:
                parser = JsonSchemaParser(schema(row['input']))
                for char in json.dumps(row['expected'], ensure_ascii=False, separators=(',', ':')):
                    self.assertIn(char, parser.get_allowed_characters(), row['id'])
                    parser = parser.add_character(char)
                self.assertTrue(parser.can_end(), row['id'])

    def test_code_still_rejects_semantic_conflicts(self):
        request = {'recipe': {'actions': [{'id': 'a1'}]}}
        for value in [
            {'intent': 'report', 'facts': [], 'clarify': []},
            {'intent': 'report', 'facts': [{'action': 'a1', 'status': 'done'}], 'clarify': ['a1']},
            {'intent': 'report', 'facts': [{'action': 'a1', 'status': 'done'}] * 2, 'clarify': []}]:
            with self.assertRaises(ValueError): validate(value, request)


if __name__ == '__main__': unittest.main()
