#!/usr/bin/env python3
"""Independent npm/pnpm addon qualification. Local reconstructed cache only; never publish.
Usage: python3 scripts/qualify-addon.py [extracted-cache] [copied-v2-report]
Package-manager and build commands are OS-confined to loopback, after positive/negative probes.
No existing files or directories are removed. Failed attempts remain available.
"""
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
import sys
import subprocess
import tempfile

PROFILE = '(version 1)(allow default)(deny network*)(allow network-outbound (remote ip "localhost:*"))(allow network-bind (local ip "localhost:*"))(allow network-inbound (local ip "localhost:*"))'


def validate_lock(text, registry):
    import re
    for url in re.findall(r'https?://[^\s"\x27,}]+', text):
        if not (url == registry or url.startswith(registry + '/')):
            raise ValueError('Nonlocal lockfile URL: ' + url)


def validate_links(root):
    for directory, dirs, files in os.walk(root / 'node_modules', followlinks=False):
        for name in dirs + files:
            item = Path(directory) / name
            if item.is_symlink() and not item.resolve().is_relative_to(root):
                raise ValueError('External symlink: ' + str(item))



def safe_output(path):
    for ancestor in [path, *path.parents]:
        if ancestor.is_symlink():
            raise ValueError('Symlink build output ancestor: ' + str(ancestor))
    if path.exists():
        if not path.is_dir():
            raise ValueError('Build output must be directory')
        for directory, dirs, files in os.walk(path, followlinks=False):
            for name in dirs + files:
                item = Path(directory) / name
                if item.is_symlink():
                    raise ValueError('Symlink in build output: ' + str(item))


def validate_candidate_file(specifier, root, candidate):
    if (root / specifier.removeprefix('file:')).resolve(strict=True) != candidate.resolve(strict=True):
        raise ValueError('Unexpected local candidate: ' + specifier)


def source_hashes(repo):
    paths = list((repo / 'packages/storybook-addon/src').rglob('*'))
    paths += [repo / 'packages/storybook-addon' / name for name in ['package.json', 'README.md', 'LICENSE', 'tsdown.config.ts', 'tsdown.tag-editor.config.ts', 'tsconfig.json']]
    paths += [repo / 'tsconfig.json']
    return {str(p.relative_to(repo)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths) if p.is_file()}



def directory_hashes(directory):
    safe_output(directory)
    if not directory.exists():
        return None
    return {str(p.relative_to(directory)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(directory.rglob('*')) if p.is_file()}


def stage_candidate(package, output, destination):
    assert not destination.exists(), 'Package staging destination must be fresh'
    safe_output(output)
    destination.mkdir()
    for name in ['package.json', 'README.md', 'LICENSE']:
        source = package / name
        assert source.is_file() and not source.is_symlink(), 'Package input must be a regular file'
        shutil.copyfile(source, destination / name)
    shutil.copytree(output, destination / 'dist', symlinks=True)
    safe_output(destination / 'dist')


def assert_no_ancestor_modules(root):
    for ancestor in root.parents:
        if (ancestor / 'node_modules').exists():
            raise ValueError('Consumer has ancestor node_modules: ' + str(ancestor))


def main():
    repo = Path(__file__).resolve().parent.parent
    evidence = Path(tempfile.mkdtemp(prefix='addon-consumer-', dir=repo / 'artifacts'))
    home = Path(tempfile.mkdtemp(prefix='governator-addon-', dir='/private/tmp')).resolve()
    env = {key: os.environ[key] for key in ['PATH']}
    env.update(HOME=str(home), TMPDIR=str(home), NODE_PATH='', CI='1', STORYBOOK_DISABLE_TELEMETRY='1', DO_NOT_TRACK='1', COREPACK_ENABLE_NETWORK='0', npm_config_update_notifier='false', npm_config_audit='false', npm_config_fund='false', npm_config_ignore_scripts='true', npm_config_fetch_retries='0')
    summary = {'evidence': str(evidence), 'consumerRoot': str(home), 'provenance': 'Dependency archives reconstructed from extracted Bun cache with unchanged original manifests; original npm registry integrity unavailable. No npm registry, publisher tarball or publication qualification.', 'cases': {}, 'commands': []}
    registry_process = None

    def run(label, args, cwd=home):
        try:
            result = subprocess.run(['/usr/bin/sandbox-exec', '-p', PROFILE] + list(map(str, args)), cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=240)
        except subprocess.TimeoutExpired as error:
            (evidence / (label + '.stdout')).write_bytes(error.stdout or b'')
            (evidence / (label + '.stderr')).write_bytes(error.stderr or b'')
            summary['commands'].append({'label': label, 'command': list(map(str, args)), 'status': 'timeout'})
            raise
        (evidence / (label + '.stdout')).write_bytes(result.stdout)
        (evidence / (label + '.stderr')).write_bytes(result.stderr)
        summary['commands'].append({'label': label, 'command': list(map(str, args)), 'code': result.returncode})
        return result

    try:
        summary['sourceCommit'] = run('source-commit', ['git', '-C', repo, 'rev-parse', 'HEAD']).stdout.decode().strip()
        registry_process = subprocess.Popen(['/usr/bin/sandbox-exec', '-p', PROFILE, 'python3', str(repo / 'scripts/local-cache-registry.py'), '--cache', str(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.home() / '.bun/install/cache'), '--evidence', str(evidence / 'selected-local-packages.json')], stdout=subprocess.PIPE, stderr=open(evidence / 'registry.stderr', 'wb'), env=env)
        registry = json.loads(registry_process.stdout.readline())['registry']
        summary['registry'] = registry
        port = int(registry.rsplit(':', 1)[1])
        probe = run('network-probes', ['node', '--input-type=module', '-e', f"""
import net from 'node:net'; import assert from 'node:assert/strict';
await new Promise((yes,no)=>{{const s=net.connect({{host:'127.0.0.1',port:{port}}},()=>{{s.end();yes();}});s.on('error',no);s.setTimeout(3000,()=>{{s.destroy();no(Error('loopback timeout'));}});}});
const denied=await new Promise((yes,no)=>{{const s=net.connect({{host:'192.0.2.1',port:80}},()=>{{s.destroy();no(Error('External allowed'));}});s.on('error',e=>yes(e.code));s.setTimeout(3000,()=>{{s.destroy();no(Error('Denial unproven'));}});}});
assert.equal(denied,'EPERM');console.log(JSON.stringify({{loopback:'connected',external:denied}}));
"""])
        if probe.returncode:
            raise RuntimeError('OS network confinement probe failed; package managers not run')
        summary['networkConfinement'] = 'sandbox-exec network deny, localhost outbound exception; positive loopback connect and negative external EPERM proven before package managers'
        before = source_hashes(repo)
        package = repo / 'packages/storybook-addon'
        repo_dist = directory_hashes(package / 'dist')
        fresh_dist = home / 'fresh-addon-dist'
        assert not fresh_dist.exists(), 'Addon build output must be fresh'
        safe_output(fresh_dist)
        rebuilt = run('addon-build', ['bun', '--bun', 'tsdown', '--out-dir', fresh_dist, '--no-clean'], package)
        if rebuilt.returncode:
            raise RuntimeError('Current-source addon build failed')
        editor = run('addon-editor-build', ['bun', '--bun', 'tsdown', '--config', 'tsdown.tag-editor.config.ts', '--out-dir', fresh_dist, '--no-clean'], package)
        if editor.returncode:
            raise RuntimeError('Current-source addon editor build failed')
        after = source_hashes(repo)
        assert before == after, 'Addon source changed during build'
        assert directory_hashes(package / 'dist') == repo_dist, 'Repository addon dist changed during fresh build'
        summary['repositoryDistBefore'] = repo_dist
        summary['repositoryDistAfter'] = directory_hashes(package / 'dist')
        summary['buildSourceBefore'] = before
        summary['buildSourceAfter'] = after
        summary['builtOutput'] = directory_hashes(fresh_dist)
        staged = home / 'staged-addon-package'
        stage_candidate(package, fresh_dist, staged)
        summary['stagedPackage'] = str(staged)
        packed = evidence / 'addon.tgz'
        result = run('bun-pack', ['bun', 'pm', 'pack', '--ignore-scripts', '--filename', packed], staged)
        if result.returncode:
            raise RuntimeError('Bun pack failed')
        extracted = run('packed-manifest', ['tar', '-xOf', str(packed), 'package/package.json'])
        assert extracted.returncode == 0, 'Packed manifest read failed'
        candidate = extracted.stdout
        manifest = json.loads(candidate)
        assert manifest['peerDependencies'] == {'storybook': '^10.6.4'}
        assert not manifest.get('dependencies')
        assert manifest['storybook']['supportedFrameworks'] == ['react']
        summary['candidate'] = {'sha256': hashlib.sha256(packed.read_bytes()).hexdigest(), 'manifest': manifest}
        summary['runnerSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        summary['sourceFiles'] = {str(p.relative_to(repo)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((repo / 'packages/storybook-addon/src').rglob('*')) if p.is_file()}
        for manager in ['npm', 'pnpm']:
            root = home / manager
            root.mkdir()
            assert_no_ancestor_modules(root)
            case = summary['cases'][manager] = {'root': str(root), 'browserNoReport': 'open: browser interaction not executed', 'browserConfiguredReport': 'open: browser interaction not executed'}
            try:
                (root / '.storybook').mkdir()
                (root / 'src').mkdir()
                (root / 'package.json').write_text(json.dumps({'name': 'independent-addon-consumer', 'private': True, 'type': 'module', 'dependencies': {'@governator/storybook-addon': 'file:' + str(packed), 'storybook': '10.6.4', '@storybook/react-vite': '10.6.4', 'react': '19.3.1', 'react-dom': '19.3.1', 'vite': '8.3.5'}}))
                common_config = f'registry={registry}\n@storybook:registry={registry}\n@governator:registry={registry}\nignore-scripts=true\naudit=false\nfund=false\nupdate-notifier=false\n'
                manager_config = 'strict-peer-deps=true\n' if manager == 'npm' else 'strict-peer-dependencies=true\nmanage-package-manager-versions=false\n'
                (root / '.npmrc').write_text(common_config + manager_config)
                env.update(HOME=str(root), TMPDIR=str(root), npm_config_registry=registry, npm_config_userconfig=str(root / '.npmrc'), npm_config_globalconfig=str(root / 'empty-global'), npm_config_cache=str(root / 'npm-cache'))
                env.pop('npm_config_store_dir', None)
                if manager == 'pnpm':
                    env['npm_config_store_dir'] = str(root / 'pnpm-store')
                (root / 'empty-global').write_text('')
                (root / '.storybook/main.ts').write_text("import {tagEditor} from '@governator/storybook-addon/tag-editor'; export default {framework:'@storybook/react-vite',stories:['../src/**/*.stories.tsx'],addons:['@governator/storybook-addon'],viteFinal:async(config)=>({...config,plugins:[...(config.plugins||[]),tagEditor()]}),core:{disableTelemetry:true}};\n")
                (root / 'src/Button.stories.tsx').write_text("import React from 'react'; const Button=()=> <button>Independent consumer</button>; export default {title:'Button',component:Button,parameters:{governance:{componentId:'ui.button'}}}; export const Default={};\n")
                pnpm = Path.home() / '.cache/node/corepack/v1/pnpm/11.9.0/bin/pnpm.cjs'
                args = ([manager] if manager == 'npm' else ['node', str(pnpm)]) + ['install', '--ignore-scripts', '--registry', registry]
                args += ['--strict-peer-deps', '--no-audit', '--no-fund'] if manager == 'npm' else ['--strict-peer-dependencies', '--store-dir', str(root / 'pnpm-store'), '--config.manage-package-manager-versions=false']
                installed = run(manager + '-install', args, root)
                case['install'] = 'passed' if installed.returncode == 0 else 'blocked-or-failed'
                if installed.returncode:
                    continue
                lock = root / ('package-lock.json' if manager == 'npm' else 'pnpm-lock.yaml')
                if manager == 'npm':
                    validate_lock('\n'.join(item.get('resolved', '') for item in json.loads(lock.read_text())['packages'].values()), registry)
                    for item in json.loads(lock.read_text())['packages'].values():
                        assert not item.get('link'), 'Unexpected npm link'
                        resolved = item.get('resolved', '')
                        if resolved.startswith('file:'):
                            validate_candidate_file(resolved, root, packed)
                        elif resolved:
                            assert resolved.startswith(registry + '/'), 'Unexpected npm resolution: ' + resolved
                else:
                    validate_lock('\n'.join(line for line in lock.read_text().splitlines() if 'tarball:' in line), registry)
                    for line in lock.read_text().splitlines():
                        assert 'link:' not in line and 'workspace:' not in line
                        for specifier in re.findall(r'file:[^\s\x27\x22(){} ,:]+', line):
                            validate_candidate_file(specifier, root, packed)
                validate_links(root)
                shutil.copyfile(lock, evidence / (manager + '-' + lock.name))
                case['lockSha256'] = hashlib.sha256(lock.read_bytes()).hexdigest()
                case['links'] = 'all symlinks remain within independent consumer'
                built = run(manager + '-build-no-report', ['node', str(root / 'node_modules/storybook/dist/bin/dispatcher.js'), 'build', '--disable-telemetry', '--output-dir', str(root / 'storybook-static')], root)
                case['buildNoReport'] = 'passed' if built.returncode == 0 else 'blocked-or-failed'
                report_path = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else None
                if report_path and built.returncode == 0:
                    report_data = report_path.read_bytes()
                    report = json.loads(report_data)
                    assert report['schemaVersion'] == 2
                    case['copiedReport'] = {'source': str(report_path), 'sha256': hashlib.sha256(report_data).hexdigest(), 'evaluatedAt': report.get('evaluatedAt'), 'assurance': 'Copied local CLI fixture only; no trusted evidence or publication proof'}
                    (root / 'public').mkdir()
                    (root / 'public/governance.json').write_bytes(report_data)
                    main = root / '.storybook/main.ts'
                    main.write_text(main.read_text().replace("core:{", "staticDirs:['../public'],core:{"))
                    with (root / 'src/Button.stories.tsx').open('a') as story:
                        story.write("export const Configured={parameters:{governance:{componentId:'ui.button',reportUrl:'/governance.json'}}};\n")
                    configured = run(manager + '-build-configured-report', ['node', str(root / 'node_modules/storybook/dist/bin/dispatcher.js'), 'build', '--disable-telemetry', '--output-dir', str(root / 'storybook-configured-static')], root)
                    case['buildConfiguredReport'] = 'passed' if configured.returncode == 0 else 'blocked-or-failed'

            except Exception as error:
                case['error'] = str(error)
    except Exception as error:
        summary['error'] = str(error)
    finally:
        if registry_process:
            registry_process.terminate()
            registry_process.wait(timeout=10)
        (evidence / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
        print(json.dumps(summary, indent=2))
    passed = len(summary['cases']) == 2 and all(c.get('buildNoReport') == 'passed' and (len(sys.argv) <= 2 or c.get('buildConfiguredReport') == 'passed') for c in summary['cases'].values())
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
