import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from reference_evidence import cues,validate
from facts_v7 import JOINT

class ReferenceEvidenceTests(unittest.TestCase):
 def test_relative_pending_property_is_not_completed_group(self):
  self.assertEqual(cues('הדבר היחיד שהיה חסר בשלב הזה כבר בוצע')['references'],['remaining'])
  self.assertEqual(validate('הפריט שעדיין מחכה לביצוע לא בוצע',('reference',7),JOINT)[0][0],'clarify')
 def test_marked_negation_is_local_to_descriptor(self):
  self.assertEqual(cues('לא אישרתי שהפעולה שכבר סומנה כמושלמת לא בוצעה')['references'],['marked'])
  self.assertEqual(cues('הפעולה שטרם סומנה כמושלמת כבר בוצעה')['references'],['remaining'])
 def test_list_and_mark_states(self):
  self.assertEqual(cues('המטלה שמשויכת לרשימת הממתינות כבר בוצעה')['references'],['remaining'])
  self.assertEqual(cues('המשימה שהסימון שלה סגור לא בוצעה')['references'],['marked'])
 def test_ordinary_report_and_unknown_descriptor_gain_no_cue(self):
  self.assertEqual(cues('הוספתי את הקמח שהיה חסר')['references'],[])
  self.assertEqual(cues('הפעולה שלא עשיתי כי היה חסר קמח לא בוצעה')['references'],[])
  self.assertEqual(validate('הפעולה שדיברנו עליה הושלמה',('reference',0),JOINT)[0],('reference',0))
 def test_no_automatic_rebinding_and_no_legacy_mutation(self):
  self.assertEqual(validate('הפעולה שנותרה נעשתה',('reference',6),JOINT)[0],('clarify',6))
  self.assertEqual(validate('הפעולה שנותרה נעשתה',('legacy',14),JOINT)[0],('readonly',14))
 def test_two_explicit_references_need_multiple_fact_extraction(self):
  self.assertEqual(validate('הפעולה שנותרה נעשתה אבל המשימה שסומנה כמושלמת לא נעשתה',('reference',0),JOINT)[0][0],'clarify')

if __name__=='__main__':unittest.main()
