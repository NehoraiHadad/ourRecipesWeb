import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from recipe_teacher_sft_v9 import encode
from recipe_teacher_study_v9 import qualify


class FrameTokenizer:
    eos_token_id=151643
    def apply_chat_template(self,conversation,**kwargs):
        return [151643,4,5,8,9,151645,198] if conversation[-1]['role']=='assistant' else [151643,4,5]


class TeacherTests(unittest.TestCase):
    def test_supervises_assistant_end_not_tokenizer_default_or_prompt(self):
        row={'input':{},'expected':{'intent':'next','facts':[],'clarify':[]},'id':'toy'}
        encoded=encode(FrameTokenizer(),row,32)
        self.assertEqual(encoded['input_ids'],[151643,4,5,8,9,151645])
        self.assertEqual(encoded['labels'],[-100,-100,-100,8,9,151645])

    def test_identical_cached_training_example_exposure(self):
        root=Path(__file__).resolve().parents[1]
        order=json.loads((root/'verification/sparse-recipe-order-v9-20261116.json').read_text())
        data=json.loads((root/'verification/sparse-recipe-control-data-v5-20261116.json').read_text())['splits']['train']
        self.assertEqual(len(order['indices']),640)
        self.assertEqual([data[i]['id'] for i in order['indices']],order['example_ids'])
        self.assertTrue(all(0<=i<360 for i in order['indices']))

    def test_teacher_thresholds_do_not_approve_product(self):
        def end(exact,critical=0):
            return {'primary':{'exact':exact,'required_changes_correct':20,'required_changes':23,'critical_wrong_fact_cases':0},
                'all_development':{'critical_wrong_fact_cases':critical},'regression':{'exact':100,'critical_wrong_fact_cases':1}}
        candidate=qualify(end(35),end(26))
        self.assertTrue(candidate['offline_teacher_candidate']);self.assertFalse(candidate['product_promotion'])
        self.assertFalse(qualify(end(35,1),end(26))['offline_teacher_candidate'])


if __name__=='__main__':unittest.main()
