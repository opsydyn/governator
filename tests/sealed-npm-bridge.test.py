"""The live-capable boundary must validate its inputs before invoking npm."""
import base64
import hashlib
import io
import json
import tarfile
import importlib.util
import sys
from pathlib import Path
import unittest
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('sealed_bridge', Path(__file__).resolve().parents[1] / 'scripts/sealed-npm-bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

class BridgeValidation(unittest.TestCase):
    def test_rejects_changed_bytes_unselected_names_and_non_fixture_credentials(self):
        data = b'fixture bytes'
        request = {'name': '@opsydyn/governator-cli', 'version': '0.1.0', 'sha256': hashlib.sha256(data).hexdigest(), 'archive': base64.b64encode(data).decode(), 'registry': 'http://127.0.0.1:1234/', 'token': 'dummy-fixture-token', 'fixture': True, 'npm': '/usr/bin/npm', 'node': '/usr/bin/node', 'provenance': {}}
        self.assertEqual(bridge.validate_request(request), data)
        for update in [{'sha256':'0'*64}, {'name':'@other/cli'}, {'token':'real-looking-token'}, {'registry':'https://registry.npmjs.org/'}]:
            with self.assertRaises(ValueError): bridge.validate_request({**request, **update})

    def test_manifest_blocks_routing_and_duplicate_or_link_entries(self):
        def pack(config, extra=None):
            payload = io.BytesIO()
            with tarfile.open(fileobj=payload, mode='w:gz') as tar:
                content = json.dumps({'name':'@opsydyn/governator-cli', 'version':'0.1.0', 'publishConfig':config}).encode()
                item = tarfile.TarInfo('package/package.json'); item.size = len(content); tar.addfile(item, io.BytesIO(content))
                if extra: tar.addfile(extra)
            return payload.getvalue()
        bridge.validate_manifest(pack({'access':'public','provenance':True}), '@opsydyn/governator-cli')
        with self.assertRaises(ValueError): bridge.validate_manifest(pack({'registry':'https://evil.invalid'}), '@opsydyn/governator-cli')
        with self.assertRaises(ValueError): bridge.validate_manifest(pack({'provenance':False}), '@opsydyn/governator-cli')
        link = tarfile.TarInfo('package/evil'); link.type = tarfile.SYMTYPE; link.linkname = '/tmp'
        with self.assertRaises(ValueError): bridge.validate_manifest(pack({}, link), '@opsydyn/governator-cli')

    def test_parent_fence_requires_exact_parent_and_isolated_session(self):
        bridge.validate_fence_identity('42', 99, 42, 99, 99)
        for args in [('42',99,1,99,99), ('42',99,42,42,99), ('bad',99,42,99,99)]:
            with self.assertRaises(ValueError): bridge.validate_fence_identity(*args)

if __name__ == '__main__': unittest.main()
