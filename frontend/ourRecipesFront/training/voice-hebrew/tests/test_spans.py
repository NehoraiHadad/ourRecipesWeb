"""Evidence decoding must exclude history and reject unsupported fragments."""
import tempfile
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from span_pilot import decode,retain_best
from span_evaluate import select_policy


def item(text, offsets, positions=None, prefix=0):
    return {'query':{'task':'action','action_id':'water','example_id':'example','label':'done','utterance':text,'context':'להוסיף מים'},
        'positions':list(range(len(offsets))) if positions is None else positions,
        'offsets':offsets,'current_start':prefix,'current_utterance':text}


def logits(tags):
    return [[10. if k==tag else -10. for k in range(8)] for tag in tags]


class SpanTests(unittest.TestCase):
    def test_later_worse_checkpoint_cannot_overwrite_best_validation_weights(self):
        class FakeModel:
            value='first'
            def save_pretrained(self,folder,**kwargs):
                folder.mkdir(parents=True,exist_ok=True);(folder/'weights.txt').write_text(self.value)
        class FakeTokenizer:
            def save_pretrained(self,folder):pass
        with tempfile.TemporaryDirectory() as tmp:
            model=FakeModel();folder=Path(tmp)
            first={'exact_including_gold_evidence':91,'update_precision':.92,'update_recall':.92}
            best=retain_best(model,FakeTokenizer(),folder,first,1000)
            model.value='later-worse'
            later={'exact_including_gold_evidence':85,'update_precision':.84,'update_recall':.92}
            best=retain_best(model,FakeTokenizer(),folder,later,2000,best)
            self.assertEqual(best['step'],1000)
            self.assertEqual((folder/'best-validation-model/weights.txt').read_text(),'first')

    def test_finer_validation_grid_does_not_mistake_coarse_all_abstain_for_best_policy(self):
        rows=[{'id':'good','scenario':'positive','utterance':'הוספתי מים','gold':{'intent':'report','changes':[{'actionId':'water','done':True,'evidence':'הוספתי מים'}]}},
              {'id':'bad','scenario':'uncertain','utterance':'אולי הוספתי מים','gold':{'intent':'clarify','changes':[]}}]
        records=[]
        for row,confidence in zip(rows,[.9995,.993]):
            records.extend([{'example_id':row['id'],'task':'intent','prediction':'report','confidence':.999},
                {'example_id':row['id'],'task':'action','action_id':'water','prediction':'done','confidence':confidence,'evidence':'הוספתי מים'}])
        best,_=select_policy(rows,records)
        self.assertEqual(best['threshold'],.995)
        self.assertEqual(best['false_updates'],0)
        self.assertEqual(best['update_recall'],1)

    def test_exact_current_evidence_and_polarity_are_preserved(self):
        q=item('עוד לא הוספתי מים',[(0,3),(4,6),(7,13),(14,17)])
        r=decode(q,logits([1,1,1,1]))
        self.assertEqual(r['prediction'],'not_done')
        self.assertEqual(r['evidence'],'עוד לא הוספתי מים')

    def test_prior_report_tokens_cannot_serve_as_current_evidence(self):
        q=item('עדיין לא',[(0,6),(7,10),(20,25),(26,28)],positions=[2,3],prefix=20)
        r=decode(q,logits([0,0,2,2]))
        self.assertEqual(r['prediction'],'not_mentioned')
        self.assertIsNone(r['evidence'])

    def test_conflicting_clauses_and_generic_correction_are_rejected(self):
        q=item('הוספתי מים אבל לא הוספתי מים',[(0,6),(7,10),(11,14),(15,17),(18,24),(25,28)])
        self.assertEqual(decode(q,logits([0,0,2,1,1,1]))['prediction'],'not_mentioned')
        q=item('תיקון לא',[(0,5),(6,8)])
        self.assertEqual(decode(q,logits([1,1]))['prediction'],'not_mentioned')


if __name__=='__main__':unittest.main()
