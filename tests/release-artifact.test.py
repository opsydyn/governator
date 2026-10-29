import importlib.util
import io
from pathlib import Path
import sys
import unittest
import warnings
import zipfile
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('artifact', Path(__file__).resolve().parents[1] / 'scripts/release-artifact.py')
artifact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifact)

class ArtifactTests(unittest.TestCase):
    def test_only_expected_regular_entries_are_accepted(self):
        def archive(names):
            out = io.BytesIO()
            with zipfile.ZipFile(out,'w') as f:
                for name in names: f.writestr(name,b'contents')
            return out.getvalue()
        self.assertEqual(artifact.read_zip(archive(['candidate.json']), {'candidate.json'})['candidate.json'], b'contents')
        for names in [['../candidate.json'], ['candidate.json', 'extra'], ['x/candidate.json']]:
            with self.assertRaises(ValueError): artifact.read_zip(archive(names), {'candidate.json'})

    def test_rejects_symlinks_and_duplicate_names(self):
        for duplicate in (False, True):
            out = io.BytesIO()
            with zipfile.ZipFile(out,'w') as f:
                if duplicate:
                    f.writestr('candidate.json',b'first')
                    with warnings.catch_warnings():
                        warnings.simplefilter('ignore', UserWarning)
                        f.writestr('candidate.json',b'second')
                else:
                    item = zipfile.ZipInfo('candidate.json')
                    item.create_system = 3
                    item.external_attr = 0o120777 << 16
                    f.writestr(item,b'/tmp/target')
            with self.assertRaises(ValueError): artifact.read_zip(out.getvalue(), {'candidate.json'})

if __name__ == '__main__': unittest.main()
