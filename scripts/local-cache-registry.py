#!/usr/bin/env python3
"""Offline reconstruction aid, never npm publication proof.

Usage: python3 scripts/local-cache-registry.py --cache ~/.bun/install/cache \
  --evidence /private/tmp/qualification/selected-local-packages.json
Prints a JSON loopback registry URL. Point an independent package manager at it;
stop with Ctrl-C. Install with lifecycle scripts disabled (for example npm
--ignore-scripts or pnpm --ignore-scripts); configure offline/cache-only client
behavior separately. This server alone cannot constrain client network access. Only extracted local cache entries are read. No proxy, network
fallback, cache writes, or automatic cleanup exists. Evidence records packages
requested (not proof of installation). Archives are deterministic reconstructions,
not original publisher tarballs. Keep evidence outside the cache in an owned folder.
All symlinks and special files inside selected packages are rejected deliberately.
Duplicate identities are checked only when requested; byte-identical manifests and
identical reconstructed archives are required across every copy. The first sorted
source is recorded, together with all equivalent source paths.
"""
import argparse
import gzip
import hashlib
import io
import json
import os
import re
import stat
import tarfile
import threading
import secrets
import weakref
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

NAME = re.compile(r'^(?:@[a-zA-Z0-9_.-]+/)?[a-zA-Z0-9_.-]+$')
VERSION = re.compile(r'^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$')
MAX_PACKAGES = 20000
MAX_FILES = 100000
MAX_BYTES = 512 * 1024 * 1024


def digest(data):
    return hashlib.sha256(data).hexdigest()


def open_directory(path):
    """Pin every directory component without following symbolic links."""
    path = Path(path).absolute()
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for component in path.parts[1:]:
            child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def read_regular_at(directory_fd, name, limit):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_fd)
    with os.fdopen(fd, 'rb') as stream:
        mode = os.fstat(stream.fileno()).st_mode
        if not stat.S_ISREG(mode):
            raise ValueError(f'Not a regular file: {name}')
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise ValueError(f'File exceeds bound: {name}')
    return data, mode


def regular_bytes(path, limit):
    fd = open_directory(path.parent)
    try:
        return read_regular_at(fd, path.name, limit)[0]
    finally:
        os.close(fd)


def archive(folder):
    """Traverse pinned directory descriptors; never follow a swapped pathname."""
    output = io.BytesIO()
    count = total = 0
    with tarfile.open(fileobj=output, mode='w') as tar:
        def visit(directory_fd, prefix):
            nonlocal count, total
            if prefix.count('/') > 128:
                raise ValueError('Package directory depth exceeds bound')
            for name in sorted(os.listdir(directory_fd)):
                count += 1
                if count > MAX_FILES:
                    raise ValueError('Package file count exceeds bound')
                relative = prefix + name
                mode = os.stat(name, dir_fd=directory_fd, follow_symlinks=False).st_mode
                if stat.S_ISDIR(mode):
                    child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory_fd)
                    try:
                        visit(child, relative + '/')
                    finally:
                        os.close(child)
                    continue
                data, mode = read_regular_at(directory_fd, name, MAX_BYTES - total)
                total += len(data)
                info = tarfile.TarInfo('package/' + relative)
                info.size = len(data)
                info.mode = 0o755 if mode & 0o111 else 0o644
                tar.addfile(info, io.BytesIO(data))
        root_fd = open_directory(folder)
        try:
            visit(root_fd, '')
        finally:
            os.close(root_fd)
    return gzip.compress(output.getvalue(), mtime=0)


def validate_dependencies(manifest):
    # npm semver ranges and npm aliases only. Unknown syntax fails closed.
    semver = re.compile(r'^[0-9A-Za-z*~^<>=| .+\-]+$')
    for field in ('dependencies', 'optionalDependencies', 'peerDependencies'):
        for name, value in manifest.get(field, {}).items():
            if not isinstance(value, str):
                raise ValueError(f'Invalid dependency: {name}')
            candidate = value
            if value.startswith('npm:'):
                alias, separator, candidate = value[4:].rpartition('@')
                if not separator or not NAME.fullmatch(alias):
                    raise ValueError(f'Invalid npm alias: {name}')
            if not candidate or not semver.fullmatch(candidate):
                raise ValueError(f'Non-semver dependency rejected: {name}={value}')


class Registry:
    def __init__(self, cache, evidence):
        self.cache = Path(cache).resolve(strict=True)
        self.evidence = Path(evidence).absolute()
        if self.evidence.is_symlink() or self.evidence.exists():
            raise ValueError('Evidence destination must be a fresh file')
        parent = self.evidence.parent
        if parent.resolve(strict=True) != parent or parent == self.cache or self.cache in parent.parents:
            raise ValueError('Evidence parent must be real and outside cache')
        self.evidence_parent_fd = open_directory(parent)
        self._close_evidence_parent = weakref.finalize(self, os.close, self.evidence_parent_fd)
        self.index = {}
        self.selected = {}
        self.lock = threading.Lock()
        candidates = []
        for entry in sorted(self.cache.iterdir()):
            if entry.is_symlink() or not entry.is_dir():
                continue
            direct_package = (entry / 'package.json').exists()
            candidates.extend(sorted(entry.iterdir()) if entry.name.startswith('@') and not direct_package else [entry])
            if len(candidates) > MAX_PACKAGES:
                raise ValueError('Cache package count exceeds bound')
        for folder in candidates:
            if folder.is_symlink() or not folder.is_dir() or not (folder / 'package.json').exists():
                continue
            raw = regular_bytes(folder / 'package.json', 4 * 1024 * 1024)
            try:
                manifest = json.loads(raw)
                name, version = manifest['name'], manifest['version']
                if not NAME.fullmatch(name) or not VERSION.fullmatch(version):
                    continue
            except (ValueError, KeyError, TypeError):
                continue
            key = (name, version)
            self.index.setdefault(key, []).append((folder, raw, manifest))

    def select(self, name, version):
        with self.lock:
            key = (name, version)
            copies = self.index[key]
            folder, raw, manifest = copies[0]
            validate_dependencies(manifest)
            data = archive(folder)
            # Ignore unrelated duplicates, but prove every requested copy equivalent.
            # Candidate order is deterministic from the sorted cache traversal.
            for other_folder, other_raw, _ in copies[1:]:
                if other_raw != raw or archive(other_folder) != data:
                    raise ValueError(f'Ambiguous cache identity: {name}@{version}')
            with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as tar:
                if tar.extractfile('package/package.json').read() != raw:
                    raise ValueError('Cache manifest changed during qualification')
            record = {'name': name, 'version': version, 'source': str(folder),
                      'equivalentSources': [str(copy[0]) for copy in copies],
                      'manifestSha256': digest(raw), 'tarballSha256': digest(data),
                      'archiveKind': 'reconstructed-from-extracted-bun-cache'}
            identity = name + '@' + version
            if identity in self.selected and self.selected[identity] != record:
                raise ValueError('Selected cache package changed')
            self.selected[identity] = record
            payload = json.dumps({'provenance': 'local reconstruction; no npm registry or publication proof',
                                  'packages': [self.selected[k] for k in sorted(self.selected)]}, indent=2) + '\n'
            # Fresh inode per update; replacing a hardlink never truncates its target.
            # The pinned directory remains safe even if its pathname is replaced.
            temporary = '.local-registry-' + secrets.token_hex(16)
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=self.evidence_parent_fd)
            try:
                with os.fdopen(fd, 'w') as stream:
                    stream.write(payload)
                os.replace(temporary, self.evidence.name,
                           src_dir_fd=self.evidence_parent_fd, dst_dir_fd=self.evidence_parent_fd)
            except BaseException:
                os.unlink(temporary, dir_fd=self.evidence_parent_fd)
                raise
            return data


def server(registry):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            if len(self.path) > 4096:
                self.send_error(414)
                return
            path = unquote(urlsplit(self.path).path).lstrip('/')
            try:
                if path.startswith('__archive__/'):
                    name, version = path[len('__archive__/'):].rsplit('/', 1)
                    data = registry.select(name, version)
                    content_type = 'application/octet-stream'
                else:
                    versions = {}
                    for (name, version), copies in registry.index.items():
                        if name == path:
                            manifest = copies[0][2]
                            try:
                                data = registry.select(name, version)
                            except (KeyError, ValueError, OSError, tarfile.TarError):
                                # Unsafe local versions cannot poison unrelated valid versions.
                                continue
                            item = dict(manifest)
                            item['dist'] = {'tarball': f'http://127.0.0.1:{self.server.server_port}/__archive__/{quote(name, safe="")}/{version}',
                                            'shasum': hashlib.sha1(data).hexdigest()}
                            versions[version] = item
                    if not versions:
                        raise KeyError(path)
                    # No invented latest tag or publish timestamp. Consumers use versions/ranges.
                    data = json.dumps({'name': path, 'versions': versions}).encode()
                    content_type = 'application/json'
            except (KeyError, ValueError, OSError, tarfile.TarError):
                self.send_error(404, 'Unavailable in bounded local cache')
                return
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
    return ThreadingHTTPServer(('127.0.0.1', 0), Handler)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', required=True)
    parser.add_argument('--evidence', required=True)
    args = parser.parse_args()
    with server(Registry(args.cache, args.evidence)) as httpd:
        print(json.dumps({'registry': f'http://127.0.0.1:{httpd.server_port}',
                          'provenance': 'reconstructed local cache only'}), flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
