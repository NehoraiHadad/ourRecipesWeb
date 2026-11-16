import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from lmformatenforcer import JsonSchemaParser
from lmformatenforcer.tokenenforcer import TokenEnforcerTokenizerData,TokenEnforcer
from sparse_recipe_stop_v8 import stop_ids,set_grammar_stops,check_stopped


class StopTests(unittest.TestCase):
    def test_both_official_stops_are_allowed_only_after_valid_json(self):
        data=TokenEnforcerTokenizerData([(1,'{}',False)],lambda ids:''.join('{}' if t==1 else '' for t in ids),10,False,12)
        set_grammar_stops(data,[10,11])
        enforcer=TokenEnforcer(data,JsonSchemaParser({'type':'object','properties':{},'additionalProperties':False}))
        before=enforcer.get_allowed_tokens([0]).allowed_tokens
        self.assertNotIn(10,before);self.assertNotIn(11,before)
        after=enforcer.get_allowed_tokens([0,1]).allowed_tokens
        self.assertIn(10,after);self.assertIn(11,after)

    def test_generation_must_not_continue_beyond_any_official_stop(self):
        self.assertEqual(check_stopped([4,151645],[151645,151643]),151645)
        self.assertIsNone(check_stopped([4,5],[151645,151643]))
        with self.assertRaises(ValueError):check_stopped([4,151645,5],[151645,151643])

    def test_invalid_stop_configuration_fails_closed(self):
        self.assertEqual(stop_ids(3),[3])
        for bad in [None,[],[-1],[True],[3,3],'3']:
            with self.assertRaises(ValueError):stop_ids(bad)


if __name__=='__main__':unittest.main()
