"""Boundary semantics, gradients, validation policy and research retention."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from boundary_head import decode,whole_word,loss
from research_decision import cost,key
from grounding_sweep import choose
from colab_job import supplemental_seed_files
from prepare import bundle
from corpus import ROOT
try:import torch
except ImportError:torch=None


def fixture():
    text='לא הוספתי מים'
    item={'query':{'task':'action','label':'not_done','example_id':'x','action_id':'a0'},
        'positions':[2,3,4],'offsets':[(0,0),(0,20),(0,2),(3,9),(10,13)],
        'current_start':0,'current_utterance':text,'targets':[1,-100,1,1,1]}
    values=[[-10.]*10 for _ in range(5)];values[0][1]=10.;values[2][8]=10.;values[4][9]=10.
    # Outside current-report domain: even stronger history activations must not leak.
    values[1][8]=100.;values[1][9]=100.
    return item,values


def metrics(fp=2,tp=80,total=100):
    return {'false_updates':fp,'proposed_updates':fp+tp,'expected_updates':total,
        'update_precision':tp/(tp+fp) if tp+fp else None,'update_recall':tp/total,
        'exact_proposals':tp,'exact_including_gold_evidence':tp}


class BoundaryTests(unittest.TestCase):
    def test_current_report_negative_span_ignores_history(self):
        item,values=fixture();record=decode(item,values)
        self.assertEqual(record['prediction'],'not_done')
        self.assertEqual(record['evidence'],'לא הוספתי מים');self.assertGreater(record['confidence'],.99)

    def test_null_and_candidate_absence_both_prevent_updates(self):
        item,values=fixture();values[0][8]=50.;values[0][9]=50.
        self.assertEqual(decode(item,values)['_boundary']['reason'],'no_evidence')
        item,values=fixture();values[0][2]=50.
        self.assertEqual(decode(item,values)['_boundary']['reason'],'candidate_absent')

    def test_subword_and_hebrew_acronym_fragments_rejected(self):
        self.assertFalse(whole_word('הוספתי מים',1,6))
        self.assertTrue(whole_word('הוספתי מים',0,10))
        self.assertFalse(whole_word('כף צ׳ילי',3,4))
        self.assertTrue(whole_word('"מים חמים"',1,10))
        item,values=fixture();item['offsets'][2]=(1,2)
        self.assertNotEqual(decode(item,values).get('evidence'),'א הוספתי מים')

    @unittest.skipIf(torch is None,'Requires ML venv')
    def test_start_end_and_negative_candidate_gradients_no_history_gradient(self):
        item,_=fixture();values=torch.zeros(1,5,10,requires_grad=True)
        v=loss(values,[item]);v.backward()
        self.assertLess(values.grad[0,0,1].item(),0)
        self.assertLess(values.grad[0,2,8].item(),0);self.assertLess(values.grad[0,4,9].item(),0)
        self.assertEqual(values.grad[0,1].abs().sum().item(),0)
        item['query']['label']='not_mentioned';item['targets']=[2,-100,2,2,2]
        values=torch.zeros(1,5,10,requires_grad=True);loss(values,[item]).backward()
        self.assertLess(values.grad[0,0,8].item(),0);self.assertLess(values.grad[0,0,9].item(),0)


class PolicyTests(unittest.TestCase):
    def test_uploaded_packet_factory_reproduces_frozen_dataset(self):
        # The factory starts at ROOT/data; shipping its derived corpus there
        # would add the augmentation twice. Exercise the actual upload layout.
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);packet=root/'material.zip';bundle(packet)
            material=root/'material'
            with zipfile.ZipFile(packet) as z:z.extractall(material)
            script="from pathlib import Path;import json;from grounding_data import build;from engine import verify_manifest;from corpus import ROOT;d,a=build(Path('check'));f=json.loads((ROOT/'verification/grounding-data-freeze-20261112.json').read_text());assert verify_manifest(d)['corpus_sha256']==f['corpus_sha256'];assert a['training_rows_sha256']==f['training_rows_sha256']"
            subprocess.run([sys.executable,'-c',script],cwd=material,check=True,capture_output=True,text=True,timeout=60)

    def test_false_updates_cost_five_and_floor_blocks_all_abstain(self):
        self.assertEqual(cost(metrics(fp=2,tp=80)),30)
        self.assertGreater(key(metrics(fp=20,tp=80)),key(metrics(fp=0,tp=0)))

    def test_worst_seed_and_recall_floor_prevent_mean_only_selection(self):
        def variants(c,b):
            return [{'arm':arm,'seed':seed,'report':{'validation_research':m}}
                for arm,ms in [('control',c),('boundary',b)] for seed,m in zip([42,17],ms)]
        control=[metrics(fp=10),metrics(fp=10)]
        self.assertEqual(choose(variants(control,[metrics(fp=0),metrics(fp=9)]))['selected_arm'],'boundary')
        self.assertEqual(choose(variants(control,[metrics(fp=0),metrics(fp=11)]))['selected_arm'],'control')
        self.assertEqual(choose(variants(control,[metrics(fp=0,tp=74),metrics(fp=0)]))['selected_arm'],'control')

    def test_all_four_checkpoint_retention_has_no_primary_duplicate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'selection-frozen.json').write_text('{"selected_arm":"boundary"}')
            (root/'artifact-retention.json').write_text('{"arms":["control","boundary"]}')
            for arm in ['control','boundary']:
                for seed in [42,17]:
                    folder=root/'ablations'/f'{arm}-{seed}'/'run/model';folder.mkdir(parents=True)
                    (folder/'model.safetensors').write_bytes(b'fixture')
            files=supplemental_seed_files(root)
            self.assertEqual(len(files),3)
            self.assertFalse(any('boundary-42' in str(t) for s,t in files))
            (root/'artifact-retention.json').write_text('{"arms":["../../foreign"]}')
            self.assertEqual(supplemental_seed_files(root),[])


if __name__=='__main__':unittest.main()
