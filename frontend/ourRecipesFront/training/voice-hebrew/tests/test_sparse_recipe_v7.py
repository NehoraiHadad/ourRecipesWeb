import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from lmformatenforcer import JsonSchemaParser
from sparse_recipe_diagnosis_v7 import EXAMPLES, messages
from sparse_recipe_reference_v6 import schema
from sparse_recipe_language_probe_v5 import build
from sparse_recipe_v3 import validate


class DiagnosisTests(unittest.TestCase):
    def test_examples_are_consistent_and_sparse(self):
        request={'recipe':{'actions':[{'id':k} for k in ['d1','d2','d3']]}}
        for _,value in EXAMPLES: validate(value,request)
        self.assertEqual(len(EXAMPLES[0][1]['facts']),1)

    def test_language_outputs_allowed_and_gold_excluded_from_messages(self):
        for row in build()['he']:
            self.assertEqual(json.loads(messages(row,'fewshot')[-1]['content']),row['input'])
            parser=JsonSchemaParser(schema(row['input']))
            for char in json.dumps(row['expected'],ensure_ascii=False,separators=(',',':')):
                self.assertIn(char,parser.get_allowed_characters());parser=parser.add_character(char)
            self.assertTrue(parser.can_end())


if __name__=='__main__':unittest.main()
