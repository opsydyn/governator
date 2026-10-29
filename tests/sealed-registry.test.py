import base64
import importlib.util
import json
from pathlib import Path
import sys
import unittest
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('fixture', Path(__file__).resolve().parents[1] / 'scripts/qualify-sealed-registry.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

class RegistryTests(unittest.TestCase):
    def test_accepts_only_selected_bytes_and_retains_them_for_readback(self):
        store = fixture.RegistryStore({'@opsydyn/governator-cli': b'approved'})
        name = '@opsydyn/governator-cli'
        def upload(data):
            return {'name': name, 'versions': {'0.1.0': {'name': name, 'version': '0.1.0'}}, '_attachments': {'archive': {'data': base64.b64encode(data).decode()}}}
        with self.assertRaises(ValueError):
            store.accept(name, upload(b'wrong'))
        store.accept(name, upload(b'approved'))
        self.assertEqual(store.read(name), b'approved')
        with self.assertRaises(ValueError):
            store.accept(name, upload(b'approved'))

if __name__ == '__main__': unittest.main()
