import ast
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest


class SerialPollingTests(unittest.TestCase):
    def test_completed_reports_are_recovered_once_by_owner(self):
        source = (Path(__file__).resolve().parents[1] / 'sparse_recipe_colab_v6_resilient.py').read_text()
        node = next(n.value for n in ast.walk(ast.parse(source)) if isinstance(n, ast.Assign)
            and isinstance(n.value, ast.JoinedStr) and 'completed_evidence' in ast.unparse(n.value))
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); (root / 'study').mkdir()
            (root / 'status.json').write_text('{"status":"running"}')
            (root / 'study/tiny-free.json').write_text('{"metrics":{"hard":{"exact":25}},"records":[]}')
            for collected, expected in [(set(), {'tiny-free.json'}), ({'tiny-free.json'}, set())]:
                code = eval(compile(ast.Expression(node), '<poll>', 'eval'), {'remote': folder, 'collected': collected})
                output = io.StringIO()
                with contextlib.redirect_stdout(output): exec(code, {})
                result = json.loads(output.getvalue().split('PILOT_STATUS=')[1])
                self.assertEqual(set(result['completed_evidence']), expected)


if __name__ == '__main__': unittest.main()
