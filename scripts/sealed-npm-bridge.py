#!/usr/bin/env python3
"""Stdin-only sealed npm bridge. No credentials in arguments or output."""
import base64
import ctypes
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import signal
import sys
import tarfile

spec = importlib.util.spec_from_file_location('sealed_npm', Path(__file__).with_name('sealed-npm.py'))
sealed_npm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sealed_npm)
NAMES = {'@opsydyn/governator-cli', '@opsydyn/governator-mcp', '@opsydyn/storybook-addon-governator'}


def validate_request(request):
    fields = {'name', 'version', 'sha256', 'archive', 'registry', 'token', 'fixture', 'npm', 'node', 'provenance'}
    if not isinstance(request, dict) or set(request) != fields:
        raise ValueError('invalid request fields')
    if request['name'] not in NAMES or request['version'] != '0.1.0' or type(request['fixture']) is not bool:
        raise ValueError('invalid package identity or mode')
    if not isinstance(request['archive'], str) or len(request['archive']) > 24 * 1024 * 1024:
        raise ValueError('invalid archive')
    data = base64.b64decode(request['archive'], validate=True)
    if not 0 < len(data) <= sealed_npm.LIMIT or not isinstance(request['sha256'], str) or not re.fullmatch(r'[a-f0-9]{64}', request['sha256']) or hashlib.sha256(data).hexdigest() != request['sha256']:
        raise ValueError('archive digest mismatch')
    sealed_npm.validate_registry(request['registry'], request['fixture'])
    if not isinstance(request['token'], str) or len(request['token']) > 4096 or not re.fullmatch(r'[\x21-\x7e]+', request['token']):
        raise ValueError('invalid token')
    if request['fixture'] and request['token'] != 'dummy-fixture-token':
        raise ValueError('fixture accepts only dummy credentials')
    if not all(isinstance(request[key], str) and os.path.isabs(request[key]) for key in ('npm', 'node')):
        raise ValueError('absolute executables required')
    if not isinstance(request['provenance'], dict) or not set(request['provenance']).issubset(sealed_npm.OIDC_KEYS) or any(not isinstance(v, str) for v in request['provenance'].values()):
        raise ValueError('invalid provenance context')
    if request['fixture'] and request['provenance']:
        raise ValueError('fixture provenance must be empty')
    return data


def validate_manifest(data, name):
    seen = set()
    manifest = None
    total = 0
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        for member in archive:
            path = member.name.rstrip('/')
            parts = path.split('/')
            if not path or parts[0] != 'package' or any(part in ('', '.', '..') for part in parts) or path in seen or not (member.isfile() or member.isdir()):
                raise ValueError('unsafe archive entry')
            seen.add(path)
            total += member.size
            if len(seen) > 10000 or total > 64 * 1024 * 1024:
                raise ValueError('archive contents exceed limits')
            if path == 'package/package.json':
                if not member.isfile() or member.size > 1024 * 1024: raise ValueError('invalid manifest')
                manifest = json.load(archive.extractfile(member))
    if not isinstance(manifest, dict) or manifest.get('name') != name or manifest.get('version') != '0.1.0':
        raise ValueError('packed manifest identity mismatch')
    config = manifest.get('publishConfig', {})
    if not isinstance(config, dict) or set(config) - {'access', 'provenance'} or config.get('access', 'public') != 'public' or config.get('provenance', True) is not True:
        raise ValueError('unsafe publishConfig')


def validate_fence_identity(expected, pid, parent, session, group):
    if not isinstance(expected, str) or not re.fullmatch(r'[1-9][0-9]{0,19}', expected) or parent != int(expected) or session != pid or group != pid:
        raise ValueError('bridge parent or session mismatch')


def install_parent_fence():
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise RuntimeError('Linux root bridge required')
    expected = os.environ.get('GOVERNATOR_PARENT_PID')
    validate_fence_identity(expected, os.getpid(), os.getppid(), os.getsid(0), os.getpgrp())
    def terminate_group(_signal, _frame):
        os.killpg(os.getpgrp(), signal.SIGKILL)
    signal.signal(signal.SIGTERM, terminate_group)
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(1, signal.SIGTERM, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), 'parent-death fence unavailable')
    validate_fence_identity(expected, os.getpid(), os.getppid(), os.getsid(0), os.getpgrp())


def main():
    install_parent_fence()
    raw = sys.stdin.buffer.read(24 * 1024 * 1024 + 1)
    if len(raw) > 24 * 1024 * 1024: raise ValueError('request exceeds limit')
    request = json.loads(raw)
    data = validate_request(request)
    validate_manifest(data, request['name'])
    sealed_npm.publish_sealed(data, request['npm'], request['node'], request['registry'], request['token'], fixture=request['fixture'], provenance_env=request['provenance'])
    print('{"status":"sent"}')

if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, KeyError, TypeError, RuntimeError, tarfile.TarError) as error:
        # No token, command line or npm output is included in errors.
        print('sealed npm transfer failed; outcome may be unknown', file=sys.stderr)
        sys.exit(1)
