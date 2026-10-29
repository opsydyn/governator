#!/usr/bin/env python3
"""Non-publishing Linux memfd custody fixture. Never uses real registry credentials."""
import base64
import errno
import fcntl
import hashlib
import http.server
import json
import os
import re
import socket
import stat
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

NAMES = ("governator-cli", "governator-mcp", "storybook-addon-governator")
LIMIT = 16 * 1024 * 1024


def read_regular(path, limit):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        meta = os.fstat(fd)
        if not stat.S_ISREG(meta.st_mode) or not 0 < meta.st_size <= limit:
            raise ValueError("invalid regular file")
        with os.fdopen(fd, "rb", closefd=False) as file:
            data = file.read(limit + 1)
        if len(data) != meta.st_size or len(data) > limit:
            raise ValueError("file changed or exceeds limit")
        return data
    finally:
        os.close(fd)


def validate(directory, digest, commit):
    if not re.fullmatch(r"[a-f0-9]{64}", digest) or not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise ValueError("invalid identity")
    root = Path(directory)
    allowed = {"candidate.json", *(f"opsydyn-{name}-0.1.0.tgz" for name in NAMES)}
    actual = set(os.listdir(root))
    if actual not in (allowed, allowed | {"SHA256SUMS"}):
        raise ValueError("unexpected candidate files")
    candidate = json.loads(read_regular(root / "candidate.json", 1024 * 1024))
    if set(candidate) != {"schemaVersion", "mode", "repository", "sourceCommit", "packages"}:
        raise ValueError("invalid candidate fields")
    if candidate["schemaVersion"] != 1 or candidate["mode"] != "local-rehearsal" or candidate["repository"] != "https://github.com/opsydyn/governator" or candidate["sourceCommit"] != commit:
        raise ValueError("candidate identity mismatch")
    if not isinstance(candidate["packages"], list) or len(candidate["packages"]) != 3:
        raise ValueError("wrong package count")
    snapshots = []
    canonical_packages = []
    for name, package in zip(NAMES, candidate["packages"], strict=True):
        if not isinstance(package, dict) or set(package) != {"name", "version", "size", "sha256"}:
            raise ValueError("invalid package record")
        data = read_regular(root / f"opsydyn-{name}-0.1.0.tgz", LIMIT)
        if package["name"] != f"@opsydyn/{name}" or package["version"] != "0.1.0" or type(package["size"]) is not int or package["size"] != len(data) or package["sha256"] != hashlib.sha256(data).hexdigest():
            raise ValueError("candidate bytes mismatch")
        canonical_packages.append({"name": package["name"], "version": package["version"], "size": package["size"], "sha256": package["sha256"]})
        snapshots.append((package["name"], data))
    canonical = {"schemaVersion": 1, "mode": "local-rehearsal", "repository": "https://github.com/opsydyn/governator", "sourceCommit": commit, "packages": canonical_packages}
    if hashlib.sha256(json.dumps(canonical, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest() != digest:
        raise ValueError("candidate digest mismatch")
    return snapshots


def verify_no_external_network():
    if os.stat("/proc/self/ns/net").st_ino == os.stat("/proc/1/ns/net").st_ino:
        raise RuntimeError("isolated network namespace required")
    sock = socket.socket()
    sock.settimeout(2)
    try:
        sock.connect(("192.0.2.1", 80))
        raise RuntimeError("external network permitted")
    except OSError as exc:
        if exc.errno not in (errno.ENETUNREACH, errno.EHOSTUNREACH):
            raise RuntimeError("external denial not established") from exc
    finally:
        sock.close()


def exercise(snapshots, npm_path, node_path):
    if sys.platform != "linux" or os.geteuid() != 0 or not os.path.isabs(npm_path) or not os.path.isabs(node_path):
        raise RuntimeError("Linux root fixture with absolute npm and node paths required")
    verify_no_external_network()
    expected = {name: data for name, data in snapshots}
    received = {}

    class Registry(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass
        def do_GET(self):
            self.send_response(404)
            self.end_headers()
        def do_PUT(self):
            from urllib.parse import unquote
            name = unquote(self.path.split("?", 1)[0].lstrip("/"))
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if name not in expected or not 0 < length <= 24 * 1024 * 1024 or name in received:
                    raise ValueError("unexpected upload")
                doc = json.loads(self.rfile.read(length))
                version = doc["versions"]["0.1.0"]
                attachments = list(doc["_attachments"].values())
                if doc["name"] != name or version["name"] != name or version["version"] != "0.1.0" or len(attachments) != 1:
                    raise ValueError("wrong uploaded identity")
                data = base64.b64decode(attachments[0]["data"], validate=True)
                if data != expected[name]:
                    raise ValueError("wrong uploaded bytes")
                received[name] = hashlib.sha256(data).hexdigest()
                self.send_response(201)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
            except (KeyError, ValueError, TypeError):
                self.send_response(400)
                self.end_headers()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Registry)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    registry = f"http://127.0.0.1:{server.server_port}/"
    results = []
    try:
        with tempfile.TemporaryDirectory(prefix="governator-sealed-") as temporary:
            os.chmod(temporary, 0o755)
            root = Path(temporary)
            staging = root / "sealed"
            staging.mkdir(mode=0o755)
            home = root / "home"
            home.mkdir(mode=0o700)
            os.chown(home, 65534, 65534)
            config = home / "npmrc"
            config.write_text(f"//127.0.0.1:{server.server_port}/:_authToken=dummy-fixture-token\n")
            os.chown(config, 65534, 65534)
            os.chmod(config, 0o600)
            global_config = home / "global-npmrc"
            global_config.write_text("")
            os.chown(global_config, 65534, 65534)
            os.chmod(global_config, 0o600)
            env = {"PATH": f"{os.path.dirname(node_path)}:/usr/bin:/bin", "HOME": str(home), "TMPDIR": str(home), "CI": "1", "npm_config_userconfig": str(config), "npm_config_globalconfig": str(global_config), "npm_config_cache": str(home / "cache"), "npm_config_registry": registry, "npm_config_fetch_retries": "0", "npm_config_update_notifier": "false", "npm_config_provenance": "false"}
            for name, data in snapshots:
                fd = os.memfd_create("candidate.tgz", os.MFD_ALLOW_SEALING)
                try:
                    offset = 0
                    while offset < len(data):
                        offset += os.write(fd, data[offset:])
                    fcntl.fcntl(fd, fcntl.F_ADD_SEALS, fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
                    link = staging / "candidate.tgz"
                    os.symlink(f"/proc/self/fd/{fd}", link)
                    probe = '''import errno, os, sys\nfd=int(sys.argv[1]); p=sys.argv[2]\nfor f in (lambda:os.write(fd,b"x"),lambda:os.ftruncate(fd,0),lambda:os.unlink(p)):\n try:f();raise SystemExit(1)\n except OSError as e:\n  if e.errno not in (errno.EPERM,errno.EACCES):raise\n'''
                    checked = subprocess.run(["/usr/bin/python3", "-c", probe, str(fd), str(link)], env=env, user=65534, group=65534, extra_groups=[], pass_fds=(fd,), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
                    if checked.returncode:
                        raise RuntimeError("unprivileged mutation was not prevented")
                    run = subprocess.run([npm_path, "publish", str(link), "--registry", registry, f"--@opsydyn:registry={registry}", "--ignore-scripts", "--access=public", "--provenance=false"], cwd=str(home), env=env, user=65534, group=65534, extra_groups=[], pass_fds=(fd,), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
                    if run.returncode or received.get(name) != hashlib.sha256(data).hexdigest():
                        raise RuntimeError(f"fixture npm upload failed for {name}")
                    results.append({"name": name, "sha256": received[name], "mutationBlocked": True})
                finally:
                    os.close(fd)
                    if (staging / "candidate.tgz").is_symlink():
                        (staging / "candidate.tgz").unlink()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
    return {"mode": "linux-sealed-loopback-fixture", "publishable": False, "packages": results}


def main():
    if len(sys.argv) not in (5, 7) or sys.argv[1] not in ("validate", "fixture"):
        raise ValueError("use validate DIR DIGEST COMMIT or fixture DIR DIGEST COMMIT NPM NODE")
    snapshots = validate(sys.argv[2], sys.argv[3], sys.argv[4])
    if sys.argv[1] == "validate" and len(sys.argv) == 5:
        print(json.dumps({"mode": "validation", "packages": len(snapshots)}))
    elif sys.argv[1] == "fixture" and len(sys.argv) == 7:
        result = exercise(snapshots, sys.argv[5], sys.argv[6])
        result.update({"sourceCommit": sys.argv[4], "candidateDigest": sys.argv[3]})
        print(json.dumps(result))
    else:
        raise ValueError("invalid argument count")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"custody qualification failed: {error}", file=sys.stderr)
        sys.exit(1)
