"""Actual Tiny BERT gradients/isolation; NOT a Hebrew quality experiment."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


class AdapterTests(unittest.TestCase):
    def test_real_gradients_disable_and_checkpoint_roundtrip_preserve_legacy(self):
        import torch
        from transformers import BertConfig,BertForTokenClassification
        from certainty_adapter import install,disabled,export,restore,modules,representation
        torch.set_num_threads(2);torch.manual_seed(73)
        cfg=BertConfig(vocab_size=100,hidden_size=24,num_hidden_layers=3,num_attention_heads=4,intermediate_size=32,num_labels=8,hidden_dropout_prob=0.,attention_probs_dropout_prob=0.)
        cfg._attn_implementation='eager'
        model=BertForTokenClassification(cfg).eval();clone=deepcopy(model)
        x={'input_ids':torch.tensor([[1,4,5,6,2],[1,7,8,9,2]]),'attention_mask':torch.ones((2,5),dtype=torch.long),'token_type_ids':torch.tensor([[0,0,1,1,1],[0,0,1,1,1]])}
        with torch.no_grad():baseline=model(**x).logits.clone()
        info=install(model,rank=4,last_layers=2);self.assertEqual(info['trainable_parameters'],768)
        with torch.no_grad():self.assertTrue(torch.equal(model(**x).logits,baseline))
        head=torch.nn.Linear(96,5)
        optimizer=torch.optim.AdamW([p for p in model.parameters() if p.requires_grad]+list(head.parameters()),lr=.01)
        target=torch.tensor([3,4])
        for _ in range(2):
            optimizer.zero_grad(set_to_none=True);loss=torch.nn.functional.cross_entropy(head(representation(model,x,2)),target);loss.backward();optimizer.step()
        self.assertTrue(any(m.up.weight.abs().sum()>0 for m in modules(model).values()))
        self.assertTrue(all(p.grad is None for name,p in model.named_parameters() if not p.requires_grad))
        with torch.no_grad():
            active=model(**x).logits.clone();self.assertFalse(torch.equal(active,baseline))
            with disabled(model):self.assertTrue(torch.equal(model(**x).logits,baseline))
        self.assertTrue(all(m.enabled for m in modules(model).values()))
        install(clone,rank=4,last_layers=2);restore(clone,export(model))
        with torch.no_grad():self.assertTrue(torch.equal(clone(**x).logits,active))
        with self.assertRaises(RuntimeError):
            with disabled(model):raise RuntimeError('test restoration after failure')
        self.assertTrue(all(m.enabled for m in modules(model).values()))

    def test_invalid_payload_does_not_partially_mutate_weights(self):
        import torch
        from transformers import BertConfig,BertForTokenClassification
        from certainty_adapter import install,export,restore
        model=BertForTokenClassification(BertConfig(vocab_size=30,hidden_size=16,num_hidden_layers=2,num_attention_heads=2,intermediate_size=24,num_labels=8))
        install(model,rank=2,last_layers=1);before=export(model);bad=deepcopy(before)
        bad[next(reversed(bad))]['up'][0,0]=float('nan')
        with self.assertRaises(ValueError):restore(model,bad)
        after=export(model)
        self.assertTrue(all(torch.equal(before[n][k],after[n][k]) for n in before for k in ('down','up')))


if __name__=='__main__':unittest.main()
