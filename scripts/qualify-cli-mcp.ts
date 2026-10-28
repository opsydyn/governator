/* eslint-disable linteffect/no-naked-object-state-update, linteffect/no-try-catch, linteffect/no-boundary-try-catch-without-effect-map, linteffect/no-string-sentinel-const -- Private subprocess qualification harness: JSON is serialized at package/CLI/SDK wire boundaries; try/finally retains evidence and terminates only its owned registry process. No domain state or shipped package uses these exceptions. */
/** Local-only installed consumer qualification. No cleanup, publication or registry fallback.
 * bun scripts/qualify-cli-mcp.ts /absolute/cli.tgz /absolute/mcp.tgz [extracted-bun-cache]
 * Dependencies are deterministic reconstructions, NOT original npm publisher archives.
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  realpath,
  readdir,
  lstat,
  copyFile,
} from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

export function assertLocalResolutions(lock: any, registry: string, candidates: string[]) {
  for (const [name, entry] of Object.entries<any>(lock.packages ?? {})) {
    assert(!entry.link, `Linked dependency: ${name}`);
    if (!entry.resolved) {
      assert(!name || entry.optional === true, `Missing required resolution: ${name}`);
      continue;
    }
    if (candidates.includes(entry.resolved)) continue;
    const url = new URL(entry.resolved);
    assert(
      url.origin === registry &&
        url.hostname === "127.0.0.1" &&
        url.protocol === "http:" &&
        !url.username &&
        !url.password,
      `Nonlocal resolution: ${name} ${entry.resolved}`,
    );
  }
}
export function assertConventionalDependencies(manifest: any) {
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const value of Object.values<string>(manifest[field] ?? {})) {
      const range = value.startsWith("npm:")
        ? value.slice(4).replace(/^(?:@[^/]+\/)?[^@]+@/, "")
        : value;
      assert(/^[0-9A-Za-z*~^<>=| .+-]+$/.test(range), `Non-semver dependency: ${value}`);
    }
  }
}
const canonical = (value: any): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.keys(value)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
          .join(",")}}`
      : JSON.stringify(value);
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

export const loopbackSandboxProfile =
  '(version 1)(allow default)(deny network*)(allow network-outbound (remote ip "localhost:*"))(allow network-bind (local ip "localhost:*"))(allow network-inbound (local ip "localhost:*"))';
export function confinedCommand(command: string[]) {
  return ["/usr/bin/sandbox-exec", "-p", loopbackSandboxProfile, ...command];
}

export type RegistrySpawner = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess;

/** The registry process must cross the same network boundary as its clients. */
export function launchRegistry(
  command: string[],
  env: Record<string, string>,
  spawnProcess: RegistrySpawner = spawn,
) {
  const confined = confinedCommand(command);
  return spawnProcess(confined[0]!, confined.slice(1), { env, stdio: ["ignore", "pipe", "pipe"] });
}

async function main() {
  assert(
    process.argv.length >= 4,
    "Usage: bun scripts/qualify-cli-mcp.ts CLI.tgz MCP.tgz [extracted-cache]",
  );
  const repo = resolve(import.meta.dirname, "..");
  const evidence = await mkdtemp(join(repo, "artifacts/cli-mcp-consumer-"));
  const consumer = await realpath(await mkdtemp("/private/tmp/governator-consumer-"));
  assert(!consumer.startsWith(repo + "/"));
  const cache = await realpath(resolve(process.argv[4] ?? join(homedir(), ".bun/install/cache")));
  const logs: any[] = [];
  const env: Record<string, string> = {
    PATH: `${dirname(process.execPath)}:${dirname(Bun.which("npm")!)}:${dirname(Bun.which("node")!)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    HOME: consumer,
    TMPDIR: consumer,
    NODE_PATH: "",
    CI: "1",
    npm_config_userconfig: join(consumer, ".npm-user-config"),
    npm_config_globalconfig: join(consumer, ".npm-global-config"),
    npm_config_cache: join(consumer, "npm-cache"),
    npm_config_ignore_scripts: "true",
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_fetch_retries: "0",
    npm_config_update_notifier: "false",
  };
  await writeFile(env.npm_config_userconfig!, "");
  await writeFile(env.npm_config_globalconfig!, "");
  async function run(label: string, command: string[], allowed = [0]) {
    const confined = confinedCommand(command);
    const result = Bun.spawnSync(confined, {
      cwd: consumer,
      env,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120000,
    });
    const stdout = result.stdout.toString(),
      stderr = result.stderr.toString();
    logs.push({ label, command, exitCode: result.exitCode });
    await writeFile(join(evidence, label + ".stdout"), stdout);
    await writeFile(join(evidence, label + ".stderr"), stderr);
    assert(allowed.includes(result.exitCode), `${label} exited ${result.exitCode}: ${stderr}`);
    return { stdout, stderr, code: result.exitCode };
  }
  const summary: any = {
    consumer,
    evidence,
    cache,
    provenance:
      "Third-party archives reconstructed from extracted Bun cache with preserved manifests; no original npm tarball or publication proof",
    status: "started",
    commands: logs,
  };
  let registryProcess: ReturnType<typeof spawn> | undefined;
  try {
    summary.observedCheckoutCommit = (
      await run("candidate-source-commit", ["git", "-C", repo, "rev-parse", "HEAD"])
    ).stdout.trim();
    await mkdir(join(consumer, "candidates"));
    const candidateFiles = [];
    for (const [i, supplied] of process.argv.slice(2, 4).entries()) {
      const source = await realpath(resolve(supplied));
      assert((await lstat(source)).isFile(), "Candidate must be a file");
      const destination = join(consumer, "candidates", `${i}.tgz`);
      await copyFile(source, destination);
      const manifest = JSON.parse(
        (await run(`candidate-${i}`, ["tar", "-xOf", destination, "package/package.json"])).stdout,
      );
      assert.equal(manifest.name, i === 0 ? "@governator/cli" : "@governator/mcp");
      assertConventionalDependencies(manifest);
      candidateFiles.push(destination);
      (summary.candidates ??= []).push({
        source,
        installed: destination,
        sha256: sha(await readFile(destination)),
        manifest,
      });
    }
    const registryCommand = [
      "python3",
      join(repo, "scripts/local-cache-registry.py"),
      "--cache",
      cache,
      "--evidence",
      join(evidence, "selected-local-packages.json"),
    ];
    logs.push({ label: "registry-server", command: confinedCommand(registryCommand) });
    registryProcess = launchRegistry(registryCommand, env);
    let serverErrors = "";
    registryProcess.stderr!.on("data", (data) => {
      serverErrors += data;
    });
    const registry = await new Promise<string>((yes, no) => {
      const timer = setTimeout(
        () => no(new Error("Loopback registry startup timeout: " + serverErrors)),
        30000,
      );
      registryProcess!.once("error", (error) => {
        clearTimeout(timer);
        no(error);
      });
      registryProcess!.once("exit", (code) => {
        clearTimeout(timer);
        no(new Error(`Registry exited ${code}: ${serverErrors}`));
      });
      registryProcess!.stdout!.once("data", (data) => {
        clearTimeout(timer);
        try {
          yes(JSON.parse(data.toString().trim()).registry);
        } catch (error) {
          no(error);
        }
      });
    });
    assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(registry));
    summary.registry = registry;
    summary.networkConfinement =
      "macOS sandbox-exec denies network except localhost; registry/resolved URLs constrained to numeric 127.0.0.1";
    await run("network-probes", [
      Bun.which("node")!,
      "--input-type=module",
      "-e",
      `
      import net from 'node:net';
      import assert from 'node:assert/strict';
      const local = new URL('${registry}');
      await new Promise((yes,no) => { const socket=net.connect({host:'127.0.0.1',port:Number(local.port)},()=>{socket.end();yes();}); socket.on('error',no); socket.setTimeout(5000,()=>{socket.destroy();no(new Error('loopback timeout'));}); });
      const denial = await new Promise((yes,no)=>{const socket=net.connect({host:'192.0.2.1',port:80},()=>{socket.destroy();no(new Error('External network unexpectedly allowed'));});socket.on('error',error=>yes(error.code));socket.setTimeout(5000,()=>{socket.destroy();no(new Error('External denial not proven'));});});
      assert.equal(denial,'EPERM'); console.log(JSON.stringify({loopback:'connected',external:denial}));
    `,
    ]);
    env.npm_config_registry = registry;
    // Force every npm scope through the bounded server and ignore ambient npm configuration.
    await writeFile(
      join(consumer, ".npmrc"),
      `registry=${registry}\n@governator:registry=${registry}\n@modelcontextprotocol:registry=${registry}\nignore-scripts=true\naudit=false\nfund=false\n`,
    );
    await writeFile(
      join(consumer, "package.json"),
      JSON.stringify(
        {
          name: "independent-governator-consumer",
          private: true,
          type: "module",
          dependencies: {
            "@governator/cli": `file:${candidateFiles[0]}`,
            "@governator/mcp": `file:${candidateFiles[1]}`,
            "@modelcontextprotocol/client": "2.4.0",
            vitest: "4.1.12",
          },
        },
        null,
        2,
      ),
    );
    await run("npm-install", [
      "npm",
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--registry",
      registry,
    ]);
    const lock = JSON.parse(await readFile(join(consumer, "package-lock.json"), "utf8"));
    assertLocalResolutions(lock, registry, [
      ...candidateFiles.map((p) => `file:${p}`),
      "file:candidates/0.tgz",
      "file:candidates/1.tgz",
    ]);
    summary.optionalResolutionLimitation =
      "Unresolved optional lock entries were unavailable from this local source or omitted by platform resolution. They were not installed or qualified; only the current host dependency graph is qualified.";
    summary.unresolvedOptionalLockEntries = Object.entries<any>(lock.packages)
      .filter(([name, item]) => name && !item.resolved && item.optional)
      .map(([name]) => name);
    await copyFile(join(consumer, "package-lock.json"), join(evidence, "package-lock.json"));
    async function checkLinks(directory: string) {
      for (const name of await readdir(directory)) {
        const path = join(directory, name),
          info = await lstat(path);
        if (info.isSymbolicLink())
          assert((await realpath(path)).startsWith(consumer + "/"), `External symlink: ${path}`);
        else if (info.isDirectory()) await checkLinks(path);
      }
    }
    await checkLinks(join(consumer, "node_modules"));
    await makeFixture(consumer);
    await run("git-init", ["git", "init", "-q"]);
    await run("git-add", ["git", "add", "."]);
    await run("git-commit", [
      "git",
      "-c",
      "user.name=Local Consumer Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "Independent installed consumer",
    ]);
    assert.equal((await run("git-clean-before", ["git", "status", "--porcelain"])).stdout, "");
    const cli = [process.execPath, join(consumer, "node_modules/.bin/governator")];
    const evaluate = await run(
      "evaluate",
      [...cli, "evaluate", "--root", consumer, "--format", "json", "--report-schema", "2"],
      [1],
    );
    assert.equal(JSON.parse(evaluate.stdout).decisions[0].gate, "insufficient_evidence");
    const checked = await run("check", [
      ...cli,
      "check",
      "--root",
      consumer,
      "--mapping",
      "governance/tests.json",
      "--format",
      "json",
      "--report-schema",
      "2",
    ]);
    const report = JSON.parse(checked.stdout);
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.publication, "unknown");
    assert.equal(report.decisions[0].gate, "ready");
    assert.equal(report.decisions[0].checks[0].evidence[0].provenance, "adapter");
    const receiptPath = checked.stderr.trim().split(" ").at(-1)!;
    assert(receiptPath.startsWith("artifacts/") && !receiptPath.includes(".."));
    const receipt = JSON.parse(await readFile(join(consumer, receiptPath), "utf8"));
    assert.equal(receipt.assurance, "local-process");
    assert.equal(receipt.runner.version, "4.1.12");
    assert.equal(
      receipt.commit,
      (await run("git-head", ["git", "rev-parse", "HEAD"])).stdout.trim(),
    );
    await writeFile(join(evidence, "receipt.json"), JSON.stringify(receipt, null, 2));
    await writeFile(join(consumer, "artifacts/report.json"), checked.stdout);
    await run("snapshot", [
      ...cli,
      "snapshot",
      "export",
      "--root",
      consumer,
      "--report",
      "artifacts/report.json",
      "--out",
      "artifacts/snapshot.json",
    ]);
    await qualifyContracts(consumer, cli, run);
    await writeFile(join(consumer, "artifacts/mcp-probe.mjs"), mcpProbe);
    await run("mcp-stdio", [
      process.execPath,
      join(consumer, "artifacts/mcp-probe.mjs"),
      consumer,
      process.execPath,
    ]);
    const malformed = await run(
      "mcp-invalid",
      [process.execPath, join(consumer, "node_modules/.bin/governator-mcp"), "--bad"],
      [2],
    );
    assert.equal(malformed.stdout, "");
    assert(malformed.stderr.length > 0);
    assert.equal((await run("git-clean-after", ["git", "status", "--porcelain"])).stdout, "");
    summary.status = "passed";
  } catch (error) {
    summary.status = "blocked-or-failed";
    summary.error = String(error);
    throw error;
  } finally {
    registryProcess?.kill("SIGTERM");
    await writeFile(join(evidence, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
    console.log(JSON.stringify({ status: summary.status, evidence, consumer }));
  }
}

async function makeFixture(root: string) {
  for (const dir of ["governance", "src", "tests", "artifacts"]) await mkdir(join(root, dir));
  const component = {
    id: "ui.button",
    name: "Button",
    package: "@example/ui",
    owners: ["@design-system"],
    lifecycle: "candidate",
    source: "src/Button.ts",
    stories: [],
    contractVersion: "1.0.0",
    exportPath: "@example/ui/button",
  };
  const policy = {
    schemaVersion: 1,
    policyVersion: "local-consumer-v1",
    requirements: {
      stable: { checks: [{ id: "unit-test", acceptedProducers: ["vitest"], maxAgeHours: 24 }] },
    },
    transitions: {
      draft: ["candidate"],
      candidate: ["stable"],
      stable: ["deprecated"],
      deprecated: ["retired"],
      retired: [],
    },
    waivers: { enabled: true, maxDurationDays: 14, disallowFor: ["ownership"] },
  };
  const files: Record<string, string> = {
    ".gitignore":
      "node_modules/\nartifacts/\nnpm-cache/\nLibrary/Caches/bun/\nnode-compile-cache/\n",
    "src/Button.ts": "export const buttonDisabled = (value: boolean) => value;\n",
    "vitest.config.ts": 'export default {test:{include:["tests/*.test.ts"]}};\n',
    "tests/button.test.ts":
      'import {test,expect} from "vitest"; import {buttonDisabled} from "../src/Button.ts"; test("disabled semantics",()=>expect(buttonDisabled(true)).toBe(true));\n',
    "governance/components.yaml": JSON.stringify({ schemaVersion: 1, components: [component] }),
    "governance/policy.yaml": JSON.stringify(policy),
    "governance/tests.json": JSON.stringify({
      schemaVersion: 1,
      mappings: [{ componentId: "ui.button", files: ["tests/button.test.ts"] }],
    }),
  };
  for (const [path, contents] of Object.entries(files)) await writeFile(join(root, path), contents);
}

async function qualifyContracts(root: string, cli: string[], run: any) {
  const config = {
    packageId: "@example/ui",
    packageVersion: "1.0.1",
    components: [
      {
        componentId: "ui.button",
        exportName: "Button",
        propsExport: "ButtonProps",
        contractVersion: "1.0.1",
      },
    ],
  };
  await writeFile(join(root, "artifacts/config.json"), JSON.stringify(config));
  // ReadonlyArray/Promise/Pick require actual TypeScript default libraries in the installed package.
  const before =
    'export interface ButtonProps {items: ReadonlyArray<string | number>; metadata: Pick<{label:string;active:boolean}, "label">; load: () => Promise<string>} export declare function Button(props: ButtonProps): string;';
  for (const [name, source] of [
    ["baseline", before],
    ["candidate", before.replace("string | number", "string")],
  ]) {
    await writeFile(join(root, "artifacts/index.d.ts"), source!);
    const result = await run(`contracts-${name}`, [
      ...cli,
      "contracts",
      "snapshot",
      "--root",
      root,
      "--config",
      "artifacts/config.json",
      "--declarations",
      "artifacts/index.d.ts",
    ]);
    await writeFile(join(root, `artifacts/${name}.json`), result.stdout);
  }
  const baseline = JSON.parse(await readFile(join(root, "artifacts/baseline.json"), "utf8"));
  await writeFile(join(root, "artifacts/baseline.sha256"), "sha256:" + sha(canonical(baseline)));
  const result = await run(
    "contracts-diff",
    [
      ...cli,
      "contracts",
      "diff",
      "--root",
      root,
      "--baseline",
      "artifacts/baseline.json",
      "--candidate",
      "artifacts/candidate.json",
      "--baseline-digest",
      "artifacts/baseline.sha256",
    ],
    [1],
  );
  assert.equal(JSON.parse(result.stdout).minimumBump, "major");
  assert.equal(JSON.parse(result.stdout).gate, "blocked");
}

const mcpProbe = `
import {strict as assert} from 'node:assert';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {spawnSync} from 'node:child_process';
const [root,bun] = process.argv.slice(2);
const cli = root+'/node_modules/.bin/governator';
const client = new Client({name:'independent-consumer',version:'0.1.0'});
const transport = new StdioClientTransport({command:bun,args:[root+'/node_modules/.bin/governator-mcp','--root',root,'--snapshot','artifacts/snapshot.json'],cwd:root,stderr:'pipe'});
const requests = {
list_components:{},get_component:{componentId:'ui.button'},get_component_evidence:{componentId:'ui.button'},evaluate_component:{componentId:'ui.button',targetLifecycle:'stable'},explain_governance_failure:{componentId:'ui.button',targetLifecycle:'stable'},get_design_system_report:{},list_approved_components:{},get_component_contract:{componentId:'ui.button'},diff_component_contract:{componentId:'ui.button',fromVersion:'1.0.0',toVersionOrCandidate:'candidate'},list_breaking_changes:{},explain_release_block:{packageId:'@example/ui',candidateVersion:'1.0.1'},get_release_manifest:{packageId:'@example/ui',version:'1.0.1'},get_consumer_compatibility:{packageId:'@example/ui',candidateVersion:'1.0.1'},plan_component_migration:{componentId:'ui.button',fromVersion:'1.0.0',toVersion:'1.0.1'}
};
try {
 await client.connect(transport);
 const {tools} = await client.listTools(); assert.equal(tools.length,14);
 assert.deepEqual(tools.map(t=>t.name).sort(),Object.keys(requests).sort());
 const results = {};
 for (const tool of tools) {
  assert.deepEqual(tool.annotations,{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});
  const result = await client.callTool({name:tool.name,arguments:requests[tool.name]}); assert(!result.isError,JSON.stringify(result));
  const query = spawnSync(bun,[cli,'query','--root',root,'--snapshot','artifacts/snapshot.json','--tool',tool.name,'--args',JSON.stringify(requests[tool.name])],{cwd:root,encoding:'utf8'});
  assert.equal(query.status,0,query.stderr); assert.deepEqual(result.structuredContent,JSON.parse(query.stdout)); results[tool.name]=result.structuredContent;
 }
 assert.equal(results.get_design_system_report.data.publication,'unknown');
 assert.equal(results.list_approved_components.data.approvalVerified,false);
 assert.equal(results.get_design_system_report.data.decisions[0].gate,'ready');
 assert.equal(results.evaluate_component.scope,'pure-unverified-evaluation');
 assert.equal(results.evaluate_component.data.gate,'insufficient_evidence');
 console.log(JSON.stringify({tools:tools.map(t=>t.name),results},null,2));
} finally { await client.close(); }
`;
if (import.meta.main) await main();
