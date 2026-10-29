#!/usr/bin/env python3
"""Linux-only, loopback-only integration fixture; never accepts real credentials."""
import base64
import hashlib
import http.server
import importlib.util
import json
import os
import signal
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
from urllib.parse import unquote, urlsplit

class RegistryStore:
    def __init__(self, expected):
        self.expected, self.uploads = expected, {}
        self.lock = threading.Lock()

    def accept(self, name, doc):
        with self.lock:
            if name not in self.expected or name in self.uploads:
                raise ValueError('unexpected or duplicate upload')
            version = doc['versions']['0.1.0']
            attachments = list(doc['_attachments'].values())
            if doc['name'] != name or version['name'] != name or version['version'] != '0.1.0' or len(attachments) != 1:
                raise ValueError('wrong identity')
            data = base64.b64decode(attachments[0]['data'], validate=True)
            if data != self.expected[name]:
                raise ValueError('wrong archive bytes')
            self.uploads[name] = data

    def read(self, name):
        with self.lock:
            return self.uploads.get(name)

    def reset(self):
        with self.lock:
            self.uploads.clear()


def main():
    if sys.platform != 'linux' or os.geteuid() != 0 or len(sys.argv) != 9:
        raise RuntimeError('Linux root fixture requires DIR DIGEST COMMIT NPM NODE BUN SCRIPT ARTIFACT_ID')
    directory, digest, commit, npm, node, bun, coordinator, artifact_id = sys.argv[1:]
    if not all(os.path.isabs(path) for path in (directory, npm, node, bun, coordinator)):
        raise ValueError('Absolute paths required')
    spec = importlib.util.spec_from_file_location('custody', Path(__file__).with_name('qualify-linux-custody.py'))
    custody = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(custody)
    custody.verify_no_external_network()
    snapshots = custody.validate(directory, digest, commit)
    store = RegistryStore(dict(snapshots))
    import fcntl

    with tempfile.TemporaryDirectory(prefix='governator-integrated-') as temporary:
        root = Path(temporary)
        os.chmod(root, 0o755)
        staging = root / 'sealed'
        staging.mkdir(mode=0o755)
        journal_dir = root / 'journal'
        journal_dir.mkdir(mode=0o700)
        home = root / 'home'
        home.mkdir(mode=0o700)
        os.chown(home, 65534, 65534)
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_args): pass
            def respond(self, code, data=b'', content='application/json'):
                self.send_response(code)
                self.send_header('Content-Type', content)
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            def do_GET(self):
                path = unquote(urlsplit(self.path).path).lstrip('/')
                if path.startswith('__archive__/'):
                    name = path[len('__archive__/'):]
                    data = store.read(name)
                    self.respond(200, data, 'application/octet-stream') if data else self.respond(404)
                    return
                name, sep, version = path.rpartition('/')
                data = store.read(name) if sep and version == '0.1.0' else None
                if data is None:
                    self.respond(404)
                    return
                record = {'name': name, 'version': '0.1.0', 'dist': {'tarball': registry + '__archive__/' + name}}
                self.respond(200, json.dumps(record).encode())
            def do_PUT(self):
                name = unquote(urlsplit(self.path).path).lstrip('/')
                try:
                    length = int(self.headers.get('Content-Length', '0'))
                    if not 0 < length <= 24 * 1024 * 1024: raise ValueError('bad length')
                    store.accept(name, json.loads(self.rfile.read(length)))
                    self.respond(201, b'{"ok":true}')
                except (ValueError, KeyError, TypeError): self.respond(400)
            def do_POST(self):
                if self.path != '/__sealed_send__': self.respond(404); return
                fd = None
                ok = False
                link = staging / 'candidate.tgz'
                try:
                    length = int(self.headers.get('Content-Length', '0'))
                    if not 0 < length <= 2048: raise ValueError('bad request')
                    request = json.loads(self.rfile.read(length))
                    if set(request) != {'name', 'version', 'sha256'} or request['version'] != '0.1.0': raise ValueError('bad request')
                    data = store.expected[request['name']]
                    if request['sha256'] != hashlib.sha256(data).hexdigest(): raise ValueError('wrong digest')
                    fd = os.memfd_create('candidate.tgz', os.MFD_ALLOW_SEALING)
                    offset = 0
                    while offset < len(data): offset += os.write(fd, data[offset:])
                    fcntl.fcntl(fd, fcntl.F_ADD_SEALS, fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
                    os.symlink(f'/proc/self/fd/{fd}', link)
                    probe = '''import errno,os,sys\nfd=int(sys.argv[1]); p=sys.argv[2]\nfor f in (lambda:os.write(fd,b"x"),lambda:os.ftruncate(fd,0),lambda:os.unlink(p)):\n try:f();raise SystemExit(1)\n except OSError as e:\n  if e.errno not in (errno.EPERM,errno.EACCES):raise\n'''
                    check = subprocess.run(['/usr/bin/python3', '-c', probe, str(fd), str(link)], env=env, user=65534, group=65534, extra_groups=[], pass_fds=(fd,), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
                    if check.returncode: raise RuntimeError('mutation probe failed')
                    run = subprocess.run([npm, 'publish', str(link), '--registry', registry, f'--@opsydyn:registry={registry}', '--ignore-scripts', '--access=public', '--provenance=false'], cwd=str(home), env=env, user=65534, group=65534, extra_groups=[], pass_fds=(fd,), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
                    if run.returncode or store.read(request['name']) != data: raise RuntimeError('fixture upload failed')
                    ok = True
                except (OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.SubprocessError):
                    pass
                finally:
                    if fd is not None: os.close(fd)
                    if link.is_symlink(): link.unlink()
                self.respond(200, b'{"ok":true}') if ok else self.respond(400)
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        registry = f'http://127.0.0.1:{server.server_port}/'
        config = home / 'npmrc'
        config.write_text(f'//127.0.0.1:{server.server_port}/:_authToken=dummy-fixture-token\n')
        os.chown(config, 65534, 65534)
        os.chmod(config, 0o600)
        global_config = home / 'global-npmrc'
        global_config.write_text('')
        os.chown(global_config, 65534, 65534)
        os.chmod(global_config, 0o600)
        env = {'PATH': f'{os.path.dirname(node)}:/usr/bin:/bin', 'HOME': str(home), 'TMPDIR': str(home), 'CI': '1', 'npm_config_userconfig': str(config), 'npm_config_globalconfig': str(global_config), 'npm_config_cache': str(home / 'cache'), 'npm_config_registry': registry, 'npm_config_fetch_retries': '0', 'npm_config_update_notifier': 'false', 'npm_config_provenance': 'false'}
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            # The root coordinator can read the dummy fixture token; it runs in this namespace.
            child_env = {'PATH': f'{os.path.dirname(bun)}:/usr/bin:/bin', 'HOME': str(home)}
            command = [bun, coordinator, directory, digest, commit, str(server.server_port)]
            interrupted = subprocess.run(command + ['interrupt', str(journal_dir), artifact_id], env=child_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
            if interrupted.returncode != -signal.SIGKILL:
                raise RuntimeError('fixture process was not killed after upload: ' + interrupted.stderr.decode(errors='replace')[-2000:])
            journal_file = journal_dir / 'journal.json'
            journal_before = json.loads(journal_file.read_bytes())
            if journal_before.get('sourceCommit') != commit or journal_before.get('candidateDigest') != digest or journal_before.get('artifactId') != artifact_id or [p['status'] for p in journal_before.get('packages', [])] != ['verified', 'unknown', 'not_attempted']:
                raise RuntimeError('interrupted durable journal mismatch')
            if set(store.uploads) != {snapshots[0][0], snapshots[1][0]}:
                raise RuntimeError('unexpected uploads before interruption')
            # This fixture owns the process and has observed its termination and completed npm child.
            # Production stale-lock recovery requires separate operator reconciliation.
            (journal_dir / 'journal.lock').rmdir()
            journal_fd = os.open(journal_dir, os.O_RDONLY)
            try: os.fsync(journal_fd)
            finally: os.close(journal_fd)
            resumed = subprocess.run(command + ['resume', str(journal_dir), artifact_id], env=child_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
            if resumed.returncode:
                raise RuntimeError('durable fixture recovery failed: ' + resumed.stderr.decode(errors='replace')[-2000:])
            resume_result = json.loads(resumed.stdout)
            journal_after = json.loads(journal_file.read_bytes())
            if resume_result.get('status') != 'complete' or [p['status'] for p in journal_after.get('packages', [])] != ['verified', 'verified', 'verified'] or set(store.uploads) != set(store.expected):
                raise RuntimeError('durable recovery verification failed')
            durable = {'interruptedBy': 'SIGKILL', 'journalBefore': journal_before, 'resume': resume_result, 'journalAfter': journal_after, 'uploads': {name: hashlib.sha256(data).hexdigest() for name, data in store.uploads.items()}}
            store.reset()
            child = subprocess.run(command, env=child_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
            if child.returncode: raise RuntimeError('integrated coordinator failed: ' + child.stderr.decode(errors='replace')[-2000:])
            receipt = json.loads(child.stdout)
            if set(store.uploads) != set(store.expected): raise RuntimeError('missing uploads')
            receipt.update({'durable': durable, 'sourceCommit': commit, 'candidateDigest': digest, 'uploads': {name: hashlib.sha256(data).hexdigest() for name, data in store.uploads.items()}})
            print(json.dumps(receipt))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.SubprocessError) as error:
        print('sealed coordinator qualification failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
