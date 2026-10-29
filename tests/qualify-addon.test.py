"""Safety regressions for the local-only addon qualification harness."""
import importlib.util
from pathlib import Path
import tempfile
import hashlib
import sys
sys.dont_write_bytecode = True
import unittest

spec = importlib.util.spec_from_file_location('qualify_addon', Path(__file__).resolve().parents[1] / 'scripts/qualify-addon.py')
qualification = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qualification)


class QualificationSafety(unittest.TestCase):
    def test_retained_candidate_version_is_explicit(self):
        manifest = {'name': '@opsydyn/storybook-addon-governator', 'version': '0.2.0'}
        qualification.validate_candidate_identity(manifest, '0.2.0')
        for expected in ['0.1.0', '', 'latest']:
            with self.assertRaises(ValueError):
                qualification.validate_candidate_identity(manifest, expected)
        with self.assertRaises(ValueError):
            qualification.validate_candidate_identity({**manifest, 'name': '@other/addon'}, '0.2.0')

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

    def test_retained_archive_snapshot_requires_exact_digest_and_regular_input(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, target = root / 'source.tgz', root / 'retained.tgz'
            source.write_bytes(b'exact reviewed bytes')
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            qualification.snapshot_retained_archive(source, target, digest)
            self.assertEqual(target.read_bytes(), source.read_bytes())
            with self.assertRaises(ValueError):
                qualification.snapshot_retained_archive(source, root / 'wrong.tgz', '0' * 64)
            link = root / 'link.tgz'
            link.symlink_to(source)
            with self.assertRaises(ValueError):
                qualification.snapshot_retained_archive(link, root / 'link-copy.tgz', digest)
            with self.assertRaises(FileExistsError):
                qualification.snapshot_retained_archive(source, target, digest)

    def test_retained_digest_is_rechecked_against_selected_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'archive.tgz'
            archive.write_bytes(b'approved')
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            qualification.verify_retained_digest(archive, digest)
            archive.write_bytes(b'changed')
            with self.assertRaises(ValueError):
                qualification.verify_retained_digest(archive, digest)

    def test_internal_pnpm_symlinks_allowed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / 'node_modules/.pnpm/package').mkdir(parents=True)
            (root / 'node_modules/package').symlink_to('.pnpm/package')
            qualification.validate_links(root)


if __name__ == '__main__':
    unittest.main()
