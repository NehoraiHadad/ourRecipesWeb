import json
from pathlib import Path
import re
import tempfile
from types import SimpleNamespace
import unittest
import zipfile

from semantic_supervision_audit_v12 import GROUPS, scores
from semantic_supervision_colab_v12 import JOB, Owner, bundle_material, validate_archive
from semantic_supervision_data_v12 import read_native
from semantic_supervision_job_v12 import archive_results, digest, unpack, write_json
from semantic_supervision_v12 import MANIFEST, ROOT, read_plan
from sparse_recipe_v3 import aggregate


class TransferTests(unittest.TestCase):
    def test_upload_is_frozen_allowlist_plus_worker(self):
        frozen = json.loads(MANIFEST.read_text())['sha256']
        with tempfile.TemporaryDirectory() as tmp:
            scratch = Path(tmp)
            bundle = scratch / 'material.zip'
            sha = bundle_material(bundle)
            unpack(bundle, scratch / 'material', sha)
            with zipfile.ZipFile(bundle) as source:
                self.assertEqual(set(source.namelist()), set(frozen) | {MANIFEST.relative_to(ROOT).as_posix(), JOB})
            for name, expected in frozen.items():
                self.assertEqual(digest(scratch / 'material' / name), expected)

    def test_two_arm_archive_integrity_and_resumable_transfer(self):
        with tempfile.TemporaryDirectory() as tmp:
            scratch = Path(tmp)
            remote = scratch / 'vm'
            remote.mkdir()
            write_json(remote / 'status.json', {'status': 'complete'})
            for arm in ('primary_replay', 'semantic'):
                folder = remote / 'study' / arm / 'checkpoint-160'
                folder.mkdir(parents=True)
                (folder / 'resume.pt').write_bytes(arm.encode())
                write_json(folder / 'adapter_config.json', {'arm': arm})
            archive_results(remote)
            manifest = json.loads((scratch / 'vm-results.zip.manifest.json').read_text())
            raw = (scratch / 'vm-results.zip').read_bytes()
            (scratch / 'results.zip.download-partial').write_bytes(raw[:20])
            args = SimpleNamespace(session='ourrecipes-v12-test', ssh_identity=scratch / 'ssh', cli='unused')
            owner = Owner(args, scratch)
            offsets = []

            def fake_ssh(*argv, limit, stdout):
                offset = int(re.search(r'f.seek\((\d+)\)', argv[-1]).group(1))
                offsets.append(offset)
                stdout.write(raw[offset:])

            owner.ssh = fake_ssh
            local = owner.download(manifest)
            recovered = scratch / 'recovered'
            self.assertEqual(offsets, [20])
            self.assertEqual(validate_archive(local, manifest, recovered), 5)
            self.assertEqual(validate_archive(local, manifest, recovered), 5)
            self.assertEqual(len(list(recovered.rglob('adapter_config.json'))), 2)
            self.assertEqual(list(recovered.rglob('resume.pt')), [])
            local.write_bytes(raw[:-1] + bytes([raw[-1] ^ 1]))
            with self.assertRaisesRegex(ValueError, 'SHA'):
                validate_archive(local, manifest, recovered)


class ScoreTests(unittest.TestCase):
    def test_recomputes_all_group_metrics_and_rejects_mismatch(self):
        splits = read_native()
        plan = read_plan()
        benchmark = json.loads((ROOT / plan['evaluation']['master_file']).read_text())['splits']
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            for group, prefix in GROUPS.items():
                rows = splits[group]
                answers = [json.dumps(row['expected']) for row in rows]
                metrics, evaluated = aggregate(rows, answers)
                records = [{'id': row['id'], 'text': text, 'evaluation': evaluation, 'tokens': []}
                           for row, text, evaluation in zip(rows, answers, evaluated, strict=True)]
                write_json(folder / f'validation-step-{prefix}0.json', {'metrics': metrics, 'records': records})
            result, baseline = scores(folder, 0, splits, benchmark)
            self.assertEqual((result['primary']['exact'], result['all_development']['exact'],
                              result['regression']['exact'], len(baseline)), (40, 160, 120, 280))
            path = folder / 'validation-step-0.json'
            changed = json.loads(path.read_text())
            changed['metrics']['exact'] = 10
            write_json(path, changed)
            with self.assertRaisesRegex(ValueError, 'raw evaluation'):
                scores(folder, 0, splits, benchmark)


if __name__ == '__main__':
    unittest.main()
