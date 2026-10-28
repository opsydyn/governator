"""Safety regressions for the local-only addon qualification harness."""
import importlib.util
from pathlib import Path
import tempfile
import sys
sys.dont_write_bytecode = True
import unittest

spec = importlib.util.spec_from_file_location('qualify_addon', Path(__file__).resolve().parents[1] / 'scripts/qualify-addon.py')
qualification = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qualification)


class QualificationSafety(unittest.TestCase):
    def test_remote_lock_resolutions_fail_closed(self):
        for value in ['https://registry.npmjs.org/react', 'http://127.0.0.1:1234.evil.test/react', 'http://localhost:1234/react', 'http://127.0.0.1:12345/react']:
            with self.assertRaises(ValueError):
                qualification.validate_lock(value, 'http://127.0.0.1:1234')
        qualification.validate_lock('http://127.0.0.1:1234/react', 'http://127.0.0.1:1234')

    def test_external_symlinks_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / 'node_modules').mkdir()
            (root / 'node_modules/leak').symlink_to('/private/tmp')
            with self.assertRaises(ValueError):
                qualification.validate_links(root)

    def test_build_output_symlinks_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            output = root / 'dist'
            output.mkdir()
            (output / 'nested').symlink_to('/private/tmp')
            with self.assertRaises(ValueError):
                qualification.safe_output(output)
            with self.assertRaises(ValueError):
                qualification.safe_output(output / 'nested/child')

    def test_stage_preserves_original_inputs_and_dist(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            package, output, stage = root / 'package', root / 'fresh-output', root / 'stage'
            package.mkdir()
            (package / 'dist').mkdir()
            (package / 'dist/existing.js').write_text('retained')
            output.mkdir()
            (output / 'index.js').write_text('fresh build')
            for name in ['package.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']:
                (package / name).write_text('original ' + name)
            before = qualification.directory_hashes(package / 'dist')
            qualification.stage_candidate(package, output, stage)
            self.assertEqual(qualification.directory_hashes(package / 'dist'), before)
            self.assertEqual((stage / 'dist/index.js').read_text(), 'fresh build')
            for name in ['package.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']:
                self.assertEqual((stage / name).read_bytes(), (package / name).read_bytes())
            with self.assertRaises(AssertionError):
                qualification.stage_candidate(package, output, stage)

    def test_relative_tarball_must_be_exact_candidate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / 'consumer').mkdir()
            candidate = root / 'candidate.tgz'
            candidate.write_bytes(b'candidate')
            other = root / 'other.tgz'
            other.write_bytes(b'other')
            qualification.validate_candidate_file('file:../candidate.tgz', root / 'consumer', candidate)
            with self.assertRaises(ValueError):
                qualification.validate_candidate_file('file:../other.tgz', root / 'consumer', candidate)

    def test_internal_pnpm_symlinks_allowed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / 'node_modules/.pnpm/package').mkdir(parents=True)
            (root / 'node_modules/package').symlink_to('.pnpm/package')
            qualification.validate_links(root)


if __name__ == '__main__':
    unittest.main()
