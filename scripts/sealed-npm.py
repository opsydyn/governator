#!/usr/bin/env python3
"""Sealed npm subprocess boundary. No executable entrypoint or ambient credentials."""
import fcntl
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

LIMIT = 16 * 1024 * 1024
OIDC_KEYS = ('ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'GITHUB_ACTIONS', 'GITHUB_REPOSITORY', 'GITHUB_SHA', 'GITHUB_REF', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_SERVER_URL', 'GITHUB_WORKFLOW_REF', 'GITHUB_EVENT_NAME', 'GITHUB_REPOSITORY_ID', 'GITHUB_REPOSITORY_OWNER_ID', 'RUNNER_ENVIRONMENT')


def validate_registry(registry, fixture):
    parsed = urlsplit(registry)
    if fixture:
        if not (parsed.scheme == 'http' and parsed.hostname == '127.0.0.1' and parsed.port and parsed.netloc == f'127.0.0.1:{parsed.port}' and parsed.path == '/' and not parsed.query and not parsed.fragment):
            raise ValueError('fixture registry must be literal loopback')
    elif registry != 'https://registry.npmjs.org/':
        raise ValueError('production registry must be npm')


def validate_provenance(values):
    if set(values) != set(OIDC_KEYS) or any(not isinstance(values[key], str) or not values[key] for key in OIDC_KEYS):
        raise ValueError('complete GitHub provenance context required')
    url = urlsplit(values['ACTIONS_ID_TOKEN_REQUEST_URL'])
    if url.scheme != 'https' or not url.hostname or not url.hostname.endswith('.actions.githubusercontent.com') or url.username or url.password:
        raise ValueError('untrusted OIDC endpoint')
    if values['GITHUB_ACTIONS'] != 'true' or values['GITHUB_REPOSITORY'] != 'opsydyn/governator' or values['GITHUB_SERVER_URL'] != 'https://github.com' or values['GITHUB_REF'] != 'refs/heads/main' or values['GITHUB_EVENT_NAME'] != 'workflow_dispatch' or values['RUNNER_ENVIRONMENT'] != 'github-hosted':
        raise ValueError('unexpected GitHub identity')
    if not re.fullmatch(r'[a-f0-9]{40}', values['GITHUB_SHA']) or not all(re.fullmatch(r'[1-9][0-9]{0,19}', values[key]) for key in ('GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_REPOSITORY_ID', 'GITHUB_REPOSITORY_OWNER_ID')):
        raise ValueError('invalid GitHub identity')
    if values['GITHUB_WORKFLOW_REF'] != 'opsydyn/governator/.github/workflows/release.yml@refs/heads/main':
        raise ValueError('unexpected workflow identity')


def run_in_group(command, *, env, cwd, pass_fds, timeout):
    child = subprocess.Popen(command, cwd=cwd, env=env, user=65534, group=65534, extra_groups=[], pass_fds=pass_fds, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        return child.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        # The bridge is an isolated session leader. Kill the entire group so npm
        # descendants cannot keep using descriptors after an unknown outcome.
        os.killpg(os.getpgrp(), signal.SIGKILL)
        raise RuntimeError('process group termination failed')


def seal_bytes(label, data):
    fd = os.memfd_create(label, os.MFD_ALLOW_SEALING)
    try:
        offset = 0
        while offset < len(data):
            written = os.write(fd, data[offset:])
            if written <= 0: raise RuntimeError('memory file write failed')
            offset += written
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
        return fd
    except BaseException:
        os.close(fd)
        raise


def npm_command(node, npm, archive, registry, fixture):
    return [node, npm, 'publish', str(archive), '--registry', registry, f'--@opsydyn:registry={registry}', '--ignore-scripts', '--access=public', f'--provenance={str(not fixture).lower()}']


def publish_sealed(data, npm, node, registry, token, *, fixture, provenance_env=None):
    """Pass a permanently sealed archive to an unprivileged npm child.

    The trusted caller is responsible for identity, approval, input inspection, runner
    isolation, authenticated preflight, persistent journal and registry readback.
    """
    validate_registry(registry, fixture)
    if sys.platform != 'linux' or os.geteuid() != 0 or os.getsid(0) != os.getpid():
        raise RuntimeError('sealed npm requires an isolated Linux root session')
    if not all(os.path.isabs(p) for p in (npm, node)):
        raise ValueError('absolute npm and node executables required')
    if not isinstance(data, bytes) or not 0 < len(data) <= LIMIT:
        raise ValueError('invalid archive size')
    if not isinstance(token, str) or not re.fullmatch(r'[\x21-\x7e]+', token):
        raise ValueError('invalid token')
    if fixture and token != 'dummy-fixture-token':
        raise ValueError('fixture accepts only a dummy token')
    values = provenance_env or {}
    if fixture and values:
        raise ValueError('fixture provenance must be empty')
    if not fixture:
        validate_provenance(values)
    with tempfile.TemporaryDirectory(prefix='governator-sealed-npm-') as temporary:
        root = Path(temporary)
        os.chmod(root, 0o755)
        staging = root / 'sealed'
        staging.mkdir(mode=0o755)
        os.chmod(staging, 0o755)
        home = root / 'home'
        home.mkdir(mode=0o700)
        os.chown(home, 65534, 65534)
        host = urlsplit(registry).netloc
        # The token never touches disk; npm receives an inherited, sealed config FD.
        config_fd = seal_bytes('npmrc', f'//{host}/:_authToken={token}\n'.encode())
        config = staging / 'npmrc'
        os.symlink(f'/proc/self/fd/{config_fd}', config)
        global_config = home / 'global-npmrc'
        global_config.write_text('')
        os.chown(global_config, 65534, 65534)
        os.chmod(global_config, 0o600)
        env = {'PATH': f'{os.path.dirname(node)}:/usr/bin:/bin', 'HOME': str(home), 'TMPDIR': str(home), 'CI': '1', 'npm_config_userconfig': str(config), 'npm_config_globalconfig': str(global_config), 'npm_config_cache': str(home / 'cache'), 'npm_config_registry': registry, 'npm_config_fetch_retries': '0', 'npm_config_update_notifier': 'false'}
        if not fixture:
            env.update({key: values[key] for key in OIDC_KEYS if values.get(key)})
        fd = seal_bytes('candidate.tgz', data)
        link = staging / 'candidate.tgz'
        try:
            os.symlink(f'/proc/self/fd/{fd}', link)
            probe = '''import errno,os,sys\nfd=int(sys.argv[1]); p=sys.argv[2]\nfor f in (lambda:os.write(fd,b"x"),lambda:os.ftruncate(fd,0),lambda:os.unlink(p)):\n try:f();raise SystemExit(1)\n except OSError as e:\n  if e.errno not in (errno.EPERM,errno.EACCES):raise\n'''
            check = run_in_group(['/usr/bin/python3', '-c', probe, str(fd), str(link)], env=env, cwd=str(home), pass_fds=(fd, config_fd), timeout=15)
            if check: raise RuntimeError('sealed mutation probe failed')
            result = run_in_group(npm_command(node, npm, link, registry, fixture), cwd=str(home), env=env, pass_fds=(fd, config_fd), timeout=120)
            if result: raise RuntimeError('npm transfer did not complete; outcome unknown')
        finally:
            os.close(fd)
            os.close(config_fd)
            if link.is_symlink(): link.unlink()
            if config.is_symlink(): config.unlink()
