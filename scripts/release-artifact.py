#!/usr/bin/env python3
"""Strict GitHub artifact ZIP decoder; it does not publish or access the network."""
import base64
import io
import json
import stat
import sys
import zipfile

CANDIDATE = {'candidate.json', 'SHA256SUMS', 'opsydyn-governator-cli-0.1.0.tgz', 'opsydyn-governator-mcp-0.1.0.tgz', 'opsydyn-storybook-addon-governator-0.1.0.tgz'}
ATTESTATION = {'attestation.jsonl'}
MAX_ZIP = 64 * 1024 * 1024
MAX_ENTRY = 16 * 1024 * 1024


def read_zip(data, expected):
    if not isinstance(data, bytes) or not 0 < len(data) <= MAX_ZIP:
        raise ValueError('invalid artifact archive size')
    results = {}
    total = 0
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) != len(expected): raise ValueError('unexpected artifact entry count')
        for entry in entries:
            mode = entry.external_attr >> 16
            file_type = stat.S_IFMT(mode)
            if entry.filename not in expected or entry.filename in results or entry.is_dir() or file_type not in (0, stat.S_IFREG) or entry.flag_bits & 1 or not 0 < entry.file_size <= MAX_ENTRY:
                raise ValueError('unsafe artifact entry')
            total += entry.file_size
            if total > MAX_ZIP: raise ValueError('artifact contents too large')
            value = archive.read(entry)
            if len(value) != entry.file_size: raise ValueError('invalid artifact entry size')
            results[entry.filename] = value
    if set(results) != expected: raise ValueError('artifact entry set mismatch')
    return results


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ('candidate', 'attestation'):
        raise ValueError('invalid artifact kind')
    data = sys.stdin.buffer.read(MAX_ZIP + 1)
    result = read_zip(data, CANDIDATE if sys.argv[1] == 'candidate' else ATTESTATION)
    print(json.dumps({key: base64.b64encode(value).decode() for key, value in result.items()}))

if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile):
        print('artifact archive rejected', file=sys.stderr)
        sys.exit(1)
