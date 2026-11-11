import copy
import ast
import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from corpus import ROOT,load_data,recipes,examples,validate,queries
from engine import compose,score,calibrate,verify_manifest,records_from_logits
from review import apply_review

class MaterialsTests(unittest.TestCase):
    def setUp(self):self.recs,self.rows=load_data()
    def test_recipe_isolation_and_synthetic_provenance(self):
        self.assertEqual(len(self.rows),720)
        self.assertEqual([sum(r["split"]==s for r in self.rows) for s in ["train","validation","test"]],[480,120,120])
        self.assertTrue(all(r["human_review"]=="pending" for r in self.rows))
        verify_manifest(ROOT/"data")
    def test_cross_split_recipe_and_exact_utterance_leaks_are_rejected(self):
        rows=copy.deepcopy(self.rows);rows[-1]["split"]="train"
        with self.assertRaisesRegex(ValueError,"Recipe split"):validate(list(self.recs.values()),rows)
        rows=copy.deepcopy(self.rows);rows[-1]["utterance"]=rows[10]["utterance"]
        with self.assertRaisesRegex(ValueError,"Utterance split"):validate(list(self.recs.values()),rows)
    def test_wrong_action_or_evidence_or_state_cannot_enter_corpus(self):
        for mutate in [lambda r:r["gold"]["changes"][0].update(actionId="unknown"),lambda r:r["gold"]["changes"][0].update(evidence="invented"),lambda r:r["state"]["completed"].append("s0a0")]:
            rows=copy.deepcopy(self.rows);mutate(rows[0])
            with self.assertRaises(ValueError):validate(list(self.recs.values()),rows)
    def test_partial_and_correction_use_explicit_negative_labels(self):
        partial=next(r for r in self.rows if r["scenario"]=="partial_step")
        self.assertEqual([c["done"] for c in partial["gold"]["changes"]],[True,False])
        correction=next(r for r in self.rows if r["scenario"]=="correction_undo")
        self.assertEqual(correction["gold"]["changes"][0]["done"],False)
        items=list(queries(self.recs[partial["recipe_id"]],partial))
        self.assertEqual([q["label"] for q in items],["report","not_mentioned","done","not_done","not_mentioned"])
    def records(self,row):
        return [{**q,"prediction":q["label"],"confidence":.9} for q in queries(self.recs[row["recipe_id"]],row)]
    def test_ambiguous_and_other_recipe_context_never_mutate_by_gold(self):
        for r in self.rows:
            if r["scenario"] in ["recipe_switch","ambiguous_pronoun","future_only"]:
                self.assertFalse(compose(self.records(r),.8)["changes"])
    def test_low_confidence_abstains_even_when_action_is_confident(self):
        row=self.rows[0];records=self.records(row);records[0]["confidence"]=.4
        self.assertEqual(compose(records,.8)["intent"],"clarify")
        self.assertEqual(compose(records,.8)["changes"],[])
    def test_metrics_penalize_over_completion_and_no_update_shortcut(self):
        row=self.rows[0];records=self.records(row)
        self.assertEqual(score([row],records,.8)["exact_rate"],1)
        records[-1].update(prediction="done")
        self.assertEqual(score([row],records,.8)["false_updates"],1)
        best,search=calibrate([row],records)
        self.assertEqual(best["proposed_updates"],0)
        self.assertEqual(best["update_recall"],0)
    def test_task_masks_prevent_cross_task_label_predictions(self):
        item=list(queries(self.recs[self.rows[0]["recipe_id"]],self.rows[0]))[0]
        pred=records_from_logits([item],[[100,0,0,2,0,0,0,0]])[0]
        self.assertEqual(pred["prediction"],"report")
    def test_review_import_records_human_changes_without_editing_seed(self):
        with tempfile.TemporaryDirectory() as d:
            sheet=Path(d)/"review.csv"
            with (ROOT/"data/review.csv").open(encoding="utf-8-sig",newline="") as f:rows=list(csv.DictReader(f))
            rows[0].update(human_decision="approved",reviewer="test-reviewer")
            with sheet.open("w",encoding="utf-8-sig",newline="") as f:
                w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
            output=Path(d)/"reviewed";apply_review(sheet,output)
            manifest=verify_manifest(output)
            self.assertEqual(manifest["human_review"],"1/720 reviewed; others pending")
            self.assertEqual(load_data(output)[1][0]["human_review"],"approved")
            self.assertEqual(load_data()[1][0]["human_review"],"pending")
    def test_notebook_cells_are_valid_python_and_have_no_saved_executions(self):
        notebook=json.loads((ROOT/"OurRecipes-Hebrew-Training.ipynb").read_text())
        for cell in notebook["cells"]:
            if cell["cell_type"]=="code":
                ast.parse("".join(cell["source"]))
                self.assertIsNone(cell["execution_count"])
                self.assertEqual(cell["outputs"],[])

if __name__=="__main__":unittest.main()
