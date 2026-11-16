import copy
import json
from collections import Counter,defaultdict
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from native_scope_data_v10 import build,native_rows
from sparse_recipe_v3 import validate


class NativeDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root=Path(__file__).resolve().parents[1]
        cls.data=build();cls.old=json.loads((cls.root/'verification/sparse-recipe-control-data-v5-20261116.json').read_text())

    def test_retention_and_evaluation_are_unchanged(self):
        before=self.old['splits']['train'];after=self.data['splits']['train']
        self.assertEqual(len(after),360)
        self.assertEqual(Counter(r['training_origin'] for r in after),{'old':180,'diverse':36,'native':144})
        self.assertEqual([r for r in before if r['training_origin']=='old'],[r for r in after if r['training_origin']=='old'])
        for key in ['validation','diagnostic','regression']:self.assertEqual(self.old['splits'][key],self.data['splits'][key])
        self.assertEqual([r['input']['recipe']['name'] for r in before],[r['input']['recipe']['name'] for r in after])

    def test_each_pair_changes_only_its_declared_axis(self):
        pairs=defaultdict(list)
        for row in native_rows():
            validate(row['expected'],row['input']);pairs[row['pair']].append(row)
        self.assertEqual(len(pairs),72)
        for a,b in pairs.values():
            left,right=copy.deepcopy(a['input']),copy.deepcopy(b['input']);axis=a['pair_axis']
            self.assertNotEqual(left.pop(axis),right.pop(axis))
            self.assertEqual(left,right);self.assertNotEqual(a['expected'],b['expected'])

    def test_target_position_cannot_identify_the_pair_type(self):
        rows=[r for r in native_rows() if r['variant']==0]
        for role in ['a','b']:
            self.assertEqual(Counter(r['role_positions'][role] for r in rows),{0:18,1:18,2:18,3:18})
        for pair in range(12):
            selected=[r for r in rows if r['pair'].endswith('-p'+str(pair))]
            self.assertEqual(set(r['role_positions']['a'] for r in selected),{0,1,2,3})

    def test_recipe_id_and_version_identify_one_consistent_fixture(self):
        fixtures={}
        for row in native_rows():
            recipe=row['input']['recipe'];key=(recipe['id'],recipe['version'])
            value=json.dumps(recipe,sort_keys=True,ensure_ascii=False)
            if key in fixtures:self.assertEqual(fixtures[key],value)
            fixtures[key]=value
        self.assertEqual(len(fixtures),72)

    def test_no_utterance_copied_from_exposed_evaluation_and_fit_is_train_only(self):
        exposed=[r for key in ['validation','diagnostic','regression'] for r in self.old['splits'][key]]
        texts={r['input']['utterance'] for r in exposed}
        self.assertFalse(any(r['input']['utterance'] in texts for r in native_rows()))
        ids={r['id'] for r in self.data['splits']['train']}
        self.assertTrue(all(r['id'] in ids for r in self.data['splits']['train_fit']))
        self.assertEqual(Counter(r['training_origin'] for r in self.data['splits']['train_fit']),{'old':12,'diverse':12,'native':12})


if __name__=='__main__':unittest.main()
