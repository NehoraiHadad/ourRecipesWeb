from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from head_trace import explain


def item(text,offsets):
    return {'query':{'task':'action','action_id':'a0','example_id':'x','label':'not_mentioned'},
        'positions':list(range(1,len(offsets)+1)),'offsets':[(0,0)]+offsets,
        'current_start':0,'current_utterance':text,'joint_gate':True}


def values(tags):return [[10. if j==tag else -10. for j in range(8)] for tag in tags]


class TraceTests(unittest.TestCase):
    def test_no_action_evidence_and_polarity_disagreement_are_distinct(self):
        q=item('לא הוספתי מים',[(0,2),(3,9),(10,13)])
        _,a=explain(q,values([0,2,2,2]));_,b=explain(q,values([0,1,1,1]))
        self.assertEqual(a['reason'],'no_evidence');self.assertEqual(b['reason'],'polarity_conflict')
        record,c=explain(q,values([1,1,1,1]))
        self.assertEqual(c['reason'],'accepted_before_intent_gate');self.assertEqual(record['evidence'],'לא הוספתי מים')

    def test_candidate_absence_and_short_quote_are_distinct(self):
        q=item('מים',[(0,3)])
        _,a=explain(q,values([2,0]));_,b=explain(q,values([0,0]))
        self.assertEqual(a['reason'],'candidate_absent');self.assertEqual(b['reason'],'short_or_generic_evidence')

    def test_correct_polarity_can_be_blocked_only_by_quote_confidence(self):
        q=item('הוספתי מים',[(0,6),(7,10)]);logits=values([0,0,0]);logits[1]=[.1,0,0,0,0,0,0,0]
        record,trace=explain(q,logits)
        self.assertEqual(record['prediction'],'done');self.assertLess(record['confidence'],.5)
        self.assertEqual(trace['reason'],'evidence_confidence')


if __name__=='__main__':unittest.main()
