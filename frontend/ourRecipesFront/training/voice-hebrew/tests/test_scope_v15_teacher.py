import json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scope_v15_teacher import examples,messages
from scope_v13_data import DATA

class TeacherPromptTests(unittest.TestCase):
 def test_few_shots_are_balanced_train_only_and_include_partial(self):
  data=json.loads(DATA.read_text())['splits'];shots=examples(data['train']);self.assertEqual(len(shots),8);self.assertEqual(sum(r['allow'] for r in shots),4);self.assertTrue(any(r['allow']==1 and r['semantics'][2]=='partial' for r in shots));held={r['text'] for s in ('test','natural_test') for r in data[s]};self.assertFalse(any(r['text'] in held for r in shots))
 def test_current_example_has_no_expected_label_in_prompt(self):
  shots=examples(json.loads(DATA.read_text())['splits']['train']);m=messages('טקסט חדש לבדיקה',shots);self.assertEqual(m[-1],{'role':'user','content':'<report>טקסט חדש לבדיקה</report>'});self.assertEqual(len(m),18)

if __name__=='__main__':unittest.main()
