"""Cost/resource cleanup and upload validation, without any cloud calls."""
import argparse
from contextlib import redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import colab_job
import colab_pilot

class ColabControlTests(unittest.TestCase):
    def test_selected_arm_second_seed_weights_survive_successful_recovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'selection-frozen.json').write_text('{"selected_arm":"combined"}')
            folder=root/'ablations/combined-17/run/model';folder.mkdir(parents=True)
            (folder/'model.safetensors').write_bytes(b'fixture-weights')
            (folder/'tokenizer.json').write_text('{}')
            (folder.parent/'run-config.json').write_text('{}')
            backup=folder.parent/'best-validation-model';backup.mkdir();(backup/'model.safetensors').write_bytes(b'duplicate')
            recovered={str(target):source.read_bytes() for source,target in colab_job.supplemental_seed_files(root)}
            self.assertEqual(recovered['retained-checkpoints/combined-17/model/model.safetensors'],b'fixture-weights')
            self.assertFalse(any('best-validation-model' in name for name in recovered))

    def test_unrecognized_selection_cannot_escape_recovery_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'selection-frozen.json').write_text('{"selected_arm":"../../foreign"}')
            self.assertEqual(colab_job.supplemental_seed_files(root),[])

    def test_ssh_stream_recovers_verified_archive_without_uploading_private_key(self):
        packed=io.BytesIO()
        with zipfile.ZipFile(packed,'w') as z:z.writestr('run/proof.json','{"ok":true}')
        content=packed.getvalue();sha=hashlib.sha256(content).hexdigest();calls=[]
        def fake(argv,**kwargs):
            calls.append(argv);stdout='ok'
            if 'ssh' in argv and 'cat' in argv:
                kwargs['stdout'].write(content)
                return subprocess.CompletedProcess(argv,0,None,b'')
            if 'exec' in argv or ('ssh' in argv and '-c' in argv and 'OURRECIPES_STATUS=' in argv[-1]):
                code=argv[-1] if 'ssh' in argv else Path(argv[argv.index('-f')+1]).read_text()
                stdout='OURRECIPES_STATUS='+json.dumps({'pid':123} if 'subprocess.Popen' in code else {'status':'complete','process_exit':0,'archive_ready':True})
            if 'download' in argv:
                Path(argv[-1]).write_text(json.dumps({'sha256':sha,'bytes':len(content),'parts':[]}) if argv[-1].endswith('archive-manifest.json') else 'log')
            return subprocess.CompletedProcess(argv,0,stdout,'')
        with tempfile.TemporaryDirectory() as tmp,patch('colab_pilot.subprocess.run',side_effect=fake),redirect_stdout(io.StringIO()):
            args=argparse.Namespace(session='ourrecipes-stream-test',output=str(Path(tmp)/'out'),reuse=False,cli='fake-colab',auth_provider=None,run_id='ourrecipes-test-run',steps=2,max_seconds=120,python_version='3.13',baseline_steps=0,ssh_identity='/private/key',targeted=True)
            colab_pilot.run(args)
            self.assertTrue((Path(args.output)/'recovered/run/proof.json').exists())
            events=json.loads((Path(args.output)/'usage-private.json').read_text())
            self.assertTrue(any(e.get('method')=='ssh-stream' for e in events))
        self.assertFalse(any('/private/key' in call for call in calls if 'upload' in call))
        self.assertTrue(any('stop' in call for call in calls))

    def test_reused_owned_session_is_stopped_when_upload_fails(self):
        calls=[]
        def fake(argv,**kwargs):
            calls.append(argv)
            return subprocess.CompletedProcess(argv,1 if 'upload' in argv else 0,'simulated','')
        with tempfile.TemporaryDirectory() as tmp,patch('colab_pilot.subprocess.run',side_effect=fake),redirect_stdout(io.StringIO()):
            args=argparse.Namespace(session='ourrecipes-test',output=str(Path(tmp)/'run'),reuse=True,cli='fake-colab',auth_provider=None,run_id='ourrecipes-test-run',steps=2,max_seconds=60)
            with self.assertRaisesRegex(RuntimeError,'upload failed'):colab_pilot.run(args)
        self.assertTrue(any('stop' in c for c in calls))
        self.assertFalse(any('new' in c for c in calls))
    def test_allocation_error_still_attempts_named_session_cleanup(self):
        calls=[]
        def fake(argv,**kwargs):
            calls.append(argv)
            return subprocess.CompletedProcess(argv,1 if 'new' in argv else 0,'simulated','')
        with tempfile.TemporaryDirectory() as tmp,patch('colab_pilot.subprocess.run',side_effect=fake),redirect_stdout(io.StringIO()):
            args=argparse.Namespace(session='ourrecipes-test',output=str(Path(tmp)/'run'),reuse=False,cli='fake-colab',auth_provider='adc',run_id='ourrecipes-test-run',steps=2,max_seconds=60)
            with self.assertRaisesRegex(RuntimeError,'new failed'):colab_pilot.run(args)
        self.assertTrue(any('stop' in c for c in calls))
        self.assertTrue(any('--gpu' in c and 'T4' in c for c in calls))
    def test_unrelated_session_name_is_rejected_before_cloud_access(self):
        with patch('colab_pilot.subprocess.run') as remote:
            with self.assertRaises(ValueError):colab_pilot.run(argparse.Namespace(session='someone-elses-notebook'))
            remote.assert_not_called()
    def test_bad_uploaded_hash_saves_diagnostic_archive_before_any_subprocess(self):
        with tempfile.TemporaryDirectory() as tmp,patch('colab_job.subprocess.run') as external,redirect_stdout(io.StringIO()):
            source=Path(tmp)/'material.zip';source.write_bytes(b'not a bundle')
            output=Path(tmp)/'result'
            with self.assertRaisesRegex(ValueError,'hash mismatch'):colab_job.execute(source,output,'wrong',steps=1,max_seconds=60)
            external.assert_not_called()
            self.assertTrue(Path(str(output)+'-results.zip.manifest.json').exists())
    def test_zip_traversal_is_rejected_before_install_or_training(self):
        with tempfile.TemporaryDirectory() as tmp,patch('colab_job.subprocess.run') as external,redirect_stdout(io.StringIO()):
            source=Path(tmp)/'material.zip'
            with zipfile.ZipFile(source,'w') as z:z.writestr('../escape.txt','bad')
            sha=hashlib.sha256(source.read_bytes()).hexdigest()
            with self.assertRaisesRegex(ValueError,'Unsafe bundle path'):colab_job.execute(source,Path(tmp)/'run',sha,steps=1,max_seconds=60)
            external.assert_not_called();self.assertFalse((Path(tmp)/'escape.txt').exists())
    def test_status_timeout_retries_read_only_poll_without_restarting_training(self):
        calls=[];polls=0
        packed=io.BytesIO()
        with zipfile.ZipFile(packed,'w') as z:z.writestr('run/proof.json','{}')
        content=packed.getvalue();sha=hashlib.sha256(content).hexdigest()
        def fake(argv,**kwargs):
            nonlocal polls
            calls.append(argv);stdout='ok'
            if 'exec' in argv:
                script=Path(argv[argv.index('-f')+1]).read_text()
                if 'subprocess.Popen' in script:stdout='OURRECIPES_STATUS={"pid":123}'
                else:
                    polls+=1
                    if polls==1:raise subprocess.TimeoutExpired(argv,90)
                    stdout='OURRECIPES_STATUS='+json.dumps({'status':'complete','phase':'complete','process_exit':0,'archive_ready':True,'log_tail':''})
            if 'download' in argv:
                dest=Path(argv[-1])
                if str(dest).endswith('archive-manifest.json'):
                    dest.write_text(json.dumps({'sha256':sha,'parts':[{'name':'part000','bytes':len(content),'sha256':sha}]}))
                elif dest.name=='part000':dest.write_bytes(content)
                else:dest.write_text('test log')
            return subprocess.CompletedProcess(argv,0,stdout,'')
        with tempfile.TemporaryDirectory() as tmp,patch('colab_pilot.subprocess.run',side_effect=fake),patch('colab_pilot.time.sleep'),redirect_stdout(io.StringIO()):
            args=argparse.Namespace(session='ourrecipes-test',output=str(Path(tmp)/'run'),reuse=False,cli='fake-colab',auth_provider=None,run_id='ourrecipes-test-run',steps=2,max_seconds=60,python_version='3.13',baseline_steps=0)
            colab_pilot.run(args)
            self.assertTrue((Path(args.output)/'recovered/run/proof.json').exists())
        self.assertEqual(polls,2)
        self.assertEqual(sum('new' in call for call in calls),1)
        self.assertTrue(any('stop' in call for call in calls))

if __name__=='__main__':unittest.main()
