import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

class StanceAdapterTests(unittest.TestCase):
 def test_separate_adapter_gradients_preserve_disabled_body(self):
  import torch
  from transformers import BertConfig,BertForTokenClassification
  from facts_v7_study import setup
  from certainty_adapter import representation,disabled
  from scope_v13_stance import StanceHead
  torch.set_num_threads(2);model=BertForTokenClassification(BertConfig(vocab_size=32,hidden_size=768,num_hidden_layers=2,num_attention_heads=12,intermediate_size=32,num_labels=8)).eval();setup(model,'factor-wide');head=StanceHead('mlp64');x={'input_ids':torch.tensor([[1,2,3,4]]),'token_type_ids':torch.tensor([[0,0,1,1]]),'attention_mask':torch.ones(1,4,dtype=torch.long)}
  with torch.no_grad(),disabled(model):before=model(**x).logits.clone()
  params=[p for p in model.parameters() if p.requires_grad]+list(head.parameters());opt=torch.optim.AdamW(params,lr=.001);loss=torch.nn.functional.cross_entropy(head(representation(model,x,4)),torch.tensor([0]));loss.backward();self.assertTrue(any(p.grad is not None and p.grad.abs().sum()>0 for p in model.parameters() if p.requires_grad));self.assertFalse(any(p.grad is not None for p in model.parameters() if not p.requires_grad));opt.step()
  with torch.no_grad(),disabled(model):after=model(**x).logits
  self.assertTrue(torch.equal(before,after))
 def test_adapter_test_requires_all_three_gates(self):
  from scope_v14_test import candidates
  d={'qualified_for_fresh_test':True,'trials':[{'seed':s,'qualified':True} for s in (42,17,73)]};self.assertEqual(len(candidates(d)),3);d['trials'][0]['qualified']=False
  with self.assertRaisesRegex(ValueError,'Three'):candidates(d)

if __name__=='__main__':unittest.main()
