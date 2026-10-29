"""Tests for the sealed npm boundary; no registry writes."""
import importlib.util
from pathlib import Path
import sys
import unittest
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('sealed_npm', Path(__file__).resolve().parents[1] / 'scripts/sealed-npm.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SealedNpmSafety(unittest.TestCase):
    def test_only_npm_or_literal_loopback_fixture_destinations(self):
        module.validate_registry('https://registry.npmjs.org/', False)
        module.validate_registry('http://127.0.0.1:1234/', True)
        for url, fixture in [('https://evil.test/',False),('http://127.0.0.1:1234/',False),('https://registry.npmjs.org/',True),('http://127.0.0.1:1234.evil.test/',True),('http://127.0.0.1:1234/path',True)]:
            with self.assertRaises(ValueError): module.validate_registry(url, fixture)

    def test_provenance_requires_complete_github_identity(self):
        context = {'ACTIONS_ID_TOKEN_REQUEST_URL':'https://pipelines.actions.githubusercontent.com/oidc', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN':'dummy', 'GITHUB_ACTIONS':'true', 'GITHUB_REPOSITORY':'opsydyn/governator', 'GITHUB_SHA':'a'*40, 'GITHUB_REF':'refs/heads/main', 'GITHUB_RUN_ID':'123', 'GITHUB_RUN_ATTEMPT':'1', 'GITHUB_SERVER_URL':'https://github.com', 'GITHUB_WORKFLOW_REF':'opsydyn/governator/.github/workflows/release.yml@refs/heads/main', 'GITHUB_EVENT_NAME':'workflow_dispatch', 'GITHUB_REPOSITORY_ID':'12', 'GITHUB_REPOSITORY_OWNER_ID':'34', 'RUNNER_ENVIRONMENT':'github-hosted'}
        module.validate_provenance(context)
        for update in [{'RUNNER_ENVIRONMENT':''}, {'GITHUB_REPOSITORY':'other/repo'}, {'ACTIONS_ID_TOKEN_REQUEST_URL':'https://evil.invalid/'}, {'GITHUB_SHA':'short'}]:
            with self.assertRaises(ValueError): module.validate_provenance({**context, **update})

    def test_npm_uses_the_selected_node_executable(self):
        command = module.npm_command('/verified/node', '/verified/npm-cli.js', '/archive.tgz', 'https://registry.npmjs.org/', False)
        self.assertEqual(command[:2], ['/verified/node', '/verified/npm-cli.js'])
        self.assertIn('--provenance=true', command)

if __name__ == '__main__': unittest.main()
