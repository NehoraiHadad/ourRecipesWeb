"""Reject invalid exposure schedules and unsafe high-accuracy candidates."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from adapter_scope_sft_v11 import load_schedule
from adapter_scope_policy_v11 import decisions


class AdapterScopeTests(unittest.TestCase):
    def test_schedule_rejects_corruption_length_and_indices(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'schedule.json'
            for values in [[0], [0,2], [0,-1], [0,True], [0,'1']]:
                path.write_text(json.dumps({'indices':values}))
                with self.assertRaises(ValueError):
                    load_schedule(path,hashlib.sha256(path.read_bytes()).hexdigest(),2,2)
            path.write_text(json.dumps({'indices':[1,0]}))
            digest=hashlib.sha256(path.read_bytes()).hexdigest()
            self.assertEqual(load_schedule(path,digest,2,2),[1,0])
            with self.assertRaises(ValueError):load_schedule(path,'0'*64,2,2)

    def test_critical_false_fact_blocks_otherwise_passing_candidate(self):
        anchor={'primary':{'exact':26},'regression':{'exact':86,'critical_wrong_fact_cases':7}}
        candidate={'primary':{'exact':35,'required_changes_correct':23,'required_changes':23},
            'all_development':{'critical_wrong_fact_cases':1},
            'regression':{'exact':100,'critical_wrong_fact_cases':0}}
        self.assertFalse(decisions(anchor,anchor,candidate)['adapter_scope_gate_passed'])
        candidate['all_development']['critical_wrong_fact_cases']=0
        self.assertTrue(decisions(anchor,anchor,candidate)['adapter_scope_gate_passed'])
        self.assertFalse(decisions(anchor,anchor,candidate)['product_promotion'])

    def test_must_retain_both_anchors(self):
        replay={'primary':{'exact':26},'regression':{'exact':86,'critical_wrong_fact_cases':11}}
        native={'primary':{'exact':26},'regression':{'exact':81,'critical_wrong_fact_cases':7}}
        candidate={'primary':{'exact':35,'required_changes_correct':23,'required_changes':23},
            'all_development':{'critical_wrong_fact_cases':0},
            'regression':{'exact':100,'critical_wrong_fact_cases':8}}
        result=decisions(replay,native,candidate)
        self.assertTrue(result['comparisons']['replay_v5']['adapter_scope_gate_passed'])
        self.assertFalse(result['adapter_scope_gate_passed'])


if __name__=='__main__':unittest.main()
