"""Run: python3 tests/local-cache-registry.test.py"""
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('local_registry', Path(__file__).parents[1] / 'scripts/local-cache-registry.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.cache = self.root / 'cache'
        self.cache.mkdir()
        self.folder = self.cache / 'example@1.2.3'
        self.folder.mkdir()
        self.raw = b'{"name":"example","version":"1.2.3","dependencies":{"other":"^2.0.0"},"peerDependencies":{"peer":"*"}}\n'
        (self.folder / 'package.json').write_bytes(self.raw)
        (self.folder / 'bin.js').write_text('#!/usr/bin/env bun\n')
        (self.folder / 'bin.js').chmod(0o755)
        self.evidence = self.root / 'evidence.json'

    def registry(self):
        return module.Registry(self.cache, self.evidence)

    def test_deterministic_reconstruction_preserves_manifest_and_executable(self):
        registry = self.registry()
        before = (self.folder / 'package.json').stat().st_mtime_ns
        first = registry.select('example', '1.2.3')
        (self.folder / 'bin.js').touch()
        self.assertEqual(first, registry.select('example', '1.2.3'))
        with tarfile.open(fileobj=io.BytesIO(first), mode='r:gz') as archive:
            self.assertEqual(archive.extractfile('package/package.json').read(), self.raw)
            self.assertEqual(archive.getmember('package/bin.js').mode, 0o755)
        record = json.loads(self.evidence.read_text())['packages'][0]
        self.assertEqual(record['manifestSha256'], module.digest(self.raw))
        self.assertEqual(record['tarballSha256'], module.digest(first))
        self.assertEqual(record['archiveKind'], 'reconstructed-from-extracted-bun-cache')
        self.assertEqual(before, (self.folder / 'package.json').stat().st_mtime_ns)

    def test_loopback_ephemeral_only(self):
        with patch.object(module, 'ThreadingHTTPServer') as constructor:
            module.server(self.registry())
            self.assertEqual(constructor.call_args.args[0], ('127.0.0.1', 0))

    def test_metadata_is_local_only_and_unknown_path_does_not_fallback(self):
        with patch.object(module, 'ThreadingHTTPServer') as constructor:
            module.server(self.registry())
            handler_type = constructor.call_args.args[1]
        handler = handler_type.__new__(handler_type)
        handler.server = SimpleNamespace(server_port=12345)
        handler.path = '/example'
        handler.wfile = io.BytesIO()
        handler.send_response = lambda code: self.assertEqual(code, 200)
        handler.send_header = lambda *args: None
        handler.end_headers = lambda: None
        handler.do_GET()
        metadata = json.loads(handler.wfile.getvalue())
        self.assertNotIn('time', metadata)
        self.assertNotIn('dist-tags', metadata)
        version = metadata['versions']['1.2.3']
        self.assertEqual(version['dependencies'], {'other': '^2.0.0'})
        self.assertTrue(version['dist']['tarball'].startswith('http://127.0.0.1:12345/'))
        handler.path = '/../../outside'
        errors = []
        handler.send_error = lambda code, *args: errors.append(code)
        handler.do_GET()
        self.assertEqual(errors, [404])

    def test_rejects_symlink_and_special_files(self):
        (self.folder / 'escape').symlink_to(self.root, target_is_directory=True)
        with self.assertRaises((ValueError, OSError)):
            self.registry().select('example', '1.2.3')
        self.assertFalse(self.evidence.exists())

    def duplicate(self):
        duplicate = self.cache / 'example@1.2.3-other'
        duplicate.mkdir()
        (duplicate / 'package.json').write_bytes(self.raw)
        (duplicate / 'bin.js').write_bytes((self.folder / 'bin.js').read_bytes())
        (duplicate / 'bin.js').chmod(0o755)
        return duplicate

    def test_requested_identical_duplicates_are_accepted(self):
        self.duplicate()
        registry = self.registry()
        self.assertEqual(registry.select('example', '1.2.3'), module.archive(self.folder))

    def test_unrelated_differing_duplicates_do_not_prevent_indexing(self):
        duplicate = self.duplicate()
        (duplicate / 'bin.js').write_text('different')
        registry = self.registry()
        self.assertIn(('example', '1.2.3'), registry.index)
        self.assertFalse(self.evidence.exists())

    def test_requested_differing_duplicates_fail_closed(self):
        duplicate = self.duplicate()
        (duplicate / 'bin.js').write_text('different')
        with self.assertRaisesRegex(ValueError, 'Ambiguous'):
            self.registry().select('example', '1.2.3')
        self.assertFalse(self.evidence.exists())

    def test_rejects_changed_manifest_and_unknown_packages(self):
        registry = self.registry()
        (self.folder / 'package.json').write_bytes(self.raw + b' ')
        with self.assertRaisesRegex(ValueError, 'changed'):
            registry.select('example', '1.2.3')
        with self.assertRaises(KeyError):
            registry.select('../outside', '1.2.3')

    def test_evidence_must_be_new_outside_cache_and_no_symlink(self):
        with self.assertRaises(ValueError):
            module.Registry(self.cache, self.cache / 'evidence.json')
        self.evidence.symlink_to(self.root / 'missing')
        with self.assertRaises(ValueError):
            self.registry()

    def test_scoped_direct_cache_entry_and_scope_container_are_indexed(self):
        direct = self.cache / '@T@3d11cc4674661a71@@@1'
        direct.mkdir()
        (direct / 'package.json').write_text('{"name":"@scope/direct","version":"1.0.0"}')
        nested = self.cache / '@scope' / 'nested@1.0.0'
        nested.mkdir(parents=True)
        (nested / 'package.json').write_text('{"name":"@scope/nested","version":"1.0.0"}')
        registry = self.registry()
        for name in ['@scope/direct', '@scope/nested']:
            self.assertIn((name, '1.0.0'), registry.index)
            registry.select(name, '1.0.0')

    def test_directory_swap_to_symlink_is_rejected(self):
        child = self.folder / 'nested'
        child.mkdir()
        (child / 'safe').write_text('safe')
        original = module.os.open
        swapped = False
        def racing_open(path, flags, *args, **kwargs):
            nonlocal swapped
            if path == 'nested' and flags & module.os.O_DIRECTORY and not swapped:
                swapped = True
                child.rename(self.folder / 'original-nested')
                child.symlink_to(self.root, target_is_directory=True)
            return original(path, flags, *args, **kwargs)
        with patch.object(module.os, 'open', side_effect=racing_open):
            with self.assertRaises(OSError):
                module.archive(self.folder)
        self.assertTrue(swapped)

    def test_evidence_hardlink_replacement_never_changes_cache(self):
        registry = self.registry()
        registry.select('example', '1.2.3')
        self.evidence.unlink()
        module.os.link(self.folder / 'package.json', self.evidence)
        registry.select('example', '1.2.3')
        self.assertEqual((self.folder / 'package.json').read_bytes(), self.raw)
        self.assertIn('packages', json.loads(self.evidence.read_text()))

    def test_evidence_parent_swap_uses_pinned_directory(self):
        parent = self.root / 'owned'
        parent.mkdir()
        registry = module.Registry(self.cache, parent / 'evidence.json')
        retained = self.root / 'retained'
        parent.rename(retained)
        parent.symlink_to(self.folder, target_is_directory=True)
        registry.select('example', '1.2.3')
        self.assertFalse((self.folder / 'evidence.json').exists())
        self.assertTrue((retained / 'evidence.json').is_file())
        self.assertEqual((self.folder / 'package.json').read_bytes(), self.raw)

    def test_non_registry_dependencies_are_rejected_before_evidence(self):
        for value in ['https://example.test/a.tgz', 'git+https://example.test/a',
                      'user/repository', 'file:../outside', 'workspace:*', 'github:user/repo']:
            manifest = json.loads(self.raw)
            manifest['dependencies']['other'] = value
            (self.folder / 'package.json').write_text(json.dumps(manifest))
            with self.assertRaises(ValueError):
                self.registry().select('example', '1.2.3')
            self.assertFalse(self.evidence.exists())
        module.validate_dependencies({'dependencies': {'alias': 'npm:@scope/pkg@^1.0.0-beta.2'}})

    def test_metadata_omits_invalid_version_but_exact_archive_fails(self):
        bad = self.cache / 'example@0.1.0'
        bad.mkdir()
        (bad / 'package.json').write_text('{"name":"example","version":"0.1.0","dependencies":{"bad":"https://example.test/bad.tgz"}}')
        with patch.object(module, 'ThreadingHTTPServer') as constructor:
            module.server(self.registry())
            handler_type = constructor.call_args.args[1]
        handler = handler_type.__new__(handler_type)
        handler.server = SimpleNamespace(server_port=12345)
        handler.path = '/example'
        handler.wfile = io.BytesIO()
        handler.send_response = lambda code: self.assertEqual(code, 200)
        handler.send_header = lambda *args: None
        handler.end_headers = lambda: None
        handler.do_GET()
        self.assertEqual(set(json.loads(handler.wfile.getvalue())['versions']), {'1.2.3'})
        handler.path = '/__archive__/example/0.1.0'
        errors = []
        handler.send_error = lambda code, *args: errors.append(code)
        handler.do_GET()
        self.assertEqual(errors, [404])
        evidence = json.loads(self.evidence.read_text())['packages']
        self.assertEqual([item['version'] for item in evidence], ['1.2.3'])

    def test_unpatched_source_selected_and_patched_variant_recorded(self):
        patched = self.cache / 'example@1.2.3_patch_hash=abcdef'
        patched.mkdir()
        (patched / 'package.json').write_bytes(self.raw)
        (patched / 'bin.js').write_text('patched')
        registry = self.registry()
        self.assertEqual(registry.select('example', '1.2.3'), module.archive(self.folder))
        record = json.loads(self.evidence.read_text())['packages'][0]
        self.assertEqual(record['source'], str(self.folder))
        self.assertEqual(record['ignoredPatchedSources'], [str(patched)])
        self.assertEqual(record['equivalentSources'], [str(self.folder)])

    def test_patched_only_source_is_never_served(self):
        self.folder.rename(self.cache / 'example@1.2.3_patch_hash=abcdef')
        with self.assertRaisesRegex(ValueError, 'Only patched'):
            self.registry().select('example', '1.2.3')
        self.assertFalse(self.evidence.exists())

    def test_enforces_package_byte_bound(self):
        registry = self.registry()
        original = module.MAX_BYTES
        try:
            module.MAX_BYTES = 1
            with self.assertRaises(ValueError):
                registry.select('example', '1.2.3')
        finally:
            module.MAX_BYTES = original


if __name__ == '__main__':
    unittest.main()
