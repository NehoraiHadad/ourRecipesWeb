import hashlib,math,sys,tempfile,unittest
from collections import Counter
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scope_v13_stance import calibrate
from scope_v17_audit import continuous_safe_cut
from scope_v17_teacher import verify_weight_files
from scope_v18_probe import build

class MeasurementAuditTests(unittest.TestCase):
 def test_upper_tail_is_not_misreported_as_no_safe_separation(self):
  rows=[{'allow':0},{'allow':1}];p=[.999,.99999]
  self.assertFalse(calibrate(rows,p)['metrics']['passed'])
  audited=continuous_safe_cut(rows,p)
  self.assertGreater(audited['threshold_float64'],max(p[:1]));self.assertEqual(audited['metrics']['unsafe_allowed'],0);self.assertEqual(audited['metrics']['asserted_allowed'],1)
 def test_invalid_scores_cannot_become_calibration_evidence(self):
  for scores in ([math.nan,.9],[.1,math.inf],[-.1,.9]):
   with self.assertRaises(ValueError):continuous_safe_cut([{'allow':0},{'allow':1}],scores)
 def test_factorial_crossing_and_partial_reporting_labels(self):
  rows=build()['rows'];self.assertEqual(len(rows),384);self.assertEqual(len(set(r['text'] for r in rows)),384);self.assertEqual(sorted(Counter(r['cell'] for r in rows).values()),[96]*4)
  self.assertEqual(Counter(r['allow'] for r in rows),{0:192,1:192});self.assertFalse(any(r['existing_full_text_split'] in ('test','natural_test') for r in rows))
  partial=[r for r in rows if r['semantics'][1]=='asserted' and r['content_status']=='partial'];self.assertEqual(len(partial),64);self.assertTrue(all(r['allow']==1 for r in partial))
 def test_real_weight_bytes_are_checked_before_loading(self):
  with tempfile.TemporaryDirectory() as temp:
   p=Path(temp)/'shard.safetensors';p.write_bytes(b'abc');manifest=[{'name':p.name,'bytes':3,'sha256':hashlib.sha256(b'abc').hexdigest()}]
   self.assertTrue(verify_weight_files(temp,manifest)[0]['verified']);p.write_bytes(b'abd')
   with self.assertRaisesRegex(ValueError,'integrity'):verify_weight_files(temp,manifest)

if __name__=='__main__':unittest.main()
