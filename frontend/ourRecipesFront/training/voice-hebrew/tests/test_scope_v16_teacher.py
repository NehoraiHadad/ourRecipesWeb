import json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scope_v16_teacher import examples,messages
from scope_v13_data import DATA

class TaxonomyPromptTests(unittest.TestCase):
 def test_demo_categories_balanced_and_new_tests_not_copied(self):
  data=json.loads(DATA.read_text())['splits'];shots=examples(data['train']);self.assertEqual(len(shots),12)
  for category in ('A','U','N'):self.assertEqual(sum(s['category']==category for s in shots),4)
  held={r['text'] for s in ('test','natural_test') for r in data[s]};self.assertFalse(any(r['text'] in held for r in shots));self.assertTrue(all(s['allow']==int(s['category']=='A') for s in shots))
 def test_prompt_includes_explicit_nonreport_examples(self):
  m=messages('new',examples([]));self.assertEqual(len(m),26);self.assertEqual(m[-1]['content'],'<report>new</report>');self.assertEqual(sum(r['role']=='assistant' and r['content']=='N' for r in m),4)

if __name__=='__main__':unittest.main()
