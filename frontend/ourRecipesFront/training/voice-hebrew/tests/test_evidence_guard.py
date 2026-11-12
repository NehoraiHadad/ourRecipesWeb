import sys,unittest,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from evidence_guard import validate

class EvidenceTests(unittest.TestCase):
 def recipe(self):return {'ingredients':['תפוח','תפוח פינק','אגס קיץ','שמיר'],'actions':[{'id':'apple','step':0,'text':'לחתוך תפוח פינק'},{'id':'pear','step':1,'text':'לחתוך אגס קיץ'},{'id':'chop','step':0,'text':'לקצוץ שמיר'},{'id':'scatter','step':1,'text':'לפזר שמיר'}]}
 def p(self,action,evidence):return {'intent':'report','changes':[{'actionId':action,'done':True,'evidence':evidence}],'requiresReview':True}
 def test_expands_partial_quote_overlap_to_full_ingredient(self):
  r=validate(self.recipe(),'עדיין לא חתכתי תפוח פינק',self.p('pear','לא חתכתי תפוח'))
  self.assertEqual(r['rejected'][0]['reason'],'contradictory_ingredient');self.assertEqual(r['proposal']['intent'],'clarify')
 def test_distinct_verb_is_rejected_but_chop_cut_synonyms_allowed(self):
  self.assertEqual(validate(self.recipe(),'קצצתי שמיר',self.p('scatter','קצצתי שמיר'))['rejected'][0]['reason'],'contradictory_verb')
  self.assertFalse(validate(self.recipe(),'חתכתי שמיר',self.p('chop','חתכתי שמיר'))['rejected'])
 def test_cross_step_literal_report_is_preserved(self):
  self.assertFalse(validate(self.recipe(),'חתכתי אגס קיץ',self.p('pear','חתכתי אגס קיץ'))['rejected'])
 def test_anaphora_unknown_verb_and_input_not_mutated(self):
  recipe=self.recipe();p=self.p('apple','המרכיב כבר בפנים');before=copy.deepcopy((recipe,p))
  self.assertEqual(validate(recipe,'המרכיב כבר בפנים',p)['proposal'],p);self.assertEqual((recipe,p),before)

if __name__=='__main__':unittest.main()
