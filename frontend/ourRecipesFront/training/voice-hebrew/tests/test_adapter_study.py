"""Duration policy and exact checkpoint continuation, no Hebrew quality score."""
from copy import deepcopy
from pathlib import Path
import sys,tempfile,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from adapter_study import Sampler,should_stop,snapshot,reload
from certainty_data import LABELS


class AdapterStudyTests(unittest.TestCase):
 def test_paired_sampler_is_balanced_and_resumes_exactly(self):
  rows=[{'label':label} for label in LABELS for _ in range(3)]
  a=Sampler(rows,42);b=Sampler(rows,42)
  self.assertEqual([a.batch() for _ in range(10)],[b.batch() for _ in range(10)])
  state=a.state();want=[a.batch() for _ in range(20)];b.load(state);self.assertEqual(want,[b.batch() for _ in range(20)])
  c=Sampler(rows,17);ids=sum([c.batch(5) for _ in range(3)],[])
  from collections import Counter
  self.assertEqual(Counter(rows[i]['label'] for i in ids),{label:3 for label in LABELS})
 def test_no_automatic_stop_at1000(self):
  self.assertFalse(should_stop(1000,20));self.assertFalse(should_stop(1750,20));self.assertFalse(should_stop(2000,3));self.assertTrue(should_stop(2000,4))
 def test_optimizer_sampler_and_dropout_rng_resume_exactly(self):
  import torch
  from transformers import BertConfig,BertForTokenClassification
  from certainty_adapter import install,representation,export
  torch.set_num_threads(2);torch.manual_seed(73)
  cfg=BertConfig(vocab_size=30,hidden_size=16,num_hidden_layers=2,num_attention_heads=2,intermediate_size=24,num_labels=8,hidden_dropout_prob=0.,attention_probs_dropout_prob=0.)
  cfg._attn_implementation='eager';model=BertForTokenClassification(cfg).eval();install(model,rank=2,last_layers=1)
  head=torch.nn.Sequential(torch.nn.Dropout(.1),torch.nn.Linear(64,5))
  opt=torch.optim.AdamW([p for p in model.parameters() if p.requires_grad]+list(head.parameters()),lr=.01)
  rows=[{'label':label} for label in LABELS];sampler=Sampler(rows,73);identity={'test':'resume'}
  x={'input_ids':torch.tensor([[1,4,5,6,2],[1,7,8,9,2]]),'attention_mask':torch.ones((2,5),dtype=torch.long),'token_type_ids':torch.tensor([[0,0,1,1,1],[0,0,1,1,1]])}
  def step():
   batch=sampler.batch(2);target=torch.tensor([LABELS.index(rows[i]['label']) for i in batch]);opt.zero_grad(set_to_none=True)
   loss=torch.nn.functional.cross_entropy(head(representation(model,x,2)),target);loss.backward();opt.step()
  step()
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'last.pt';snapshot(path,head,model,opt,sampler,1,identity);step();want=deepcopy(head.state_dict());adapters=export(model)
   self.assertEqual(reload(path,head,model,opt,sampler,identity),1);step()
   self.assertTrue(all(torch.equal(want[n],t) for n,t in head.state_dict().items()))
   got=export(model);self.assertTrue(all(torch.equal(adapters[n][k],got[n][k]) for n in got for k in ('up','down')))
   with self.assertRaises(ValueError):reload(path,head,model,opt,sampler,{'test':'wrong'})


if __name__=='__main__':unittest.main()
