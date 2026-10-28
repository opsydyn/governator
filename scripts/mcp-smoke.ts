import { gitIndexDigest } from "./mcp-smoke-inventory.ts";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { resolve, join } from "node:path";
import { readFile, lstat } from "node:fs/promises";
import { createQueryService, loadSnapshot, toolNames } from "../packages/query/src/index.ts";
import { git } from "../packages/query/src/io.ts";
import { digest, ensure } from "../packages/core/src/index.ts";
import { bytesDigest } from "../packages/query/src/archive.ts";
import { runCli } from "../packages/cli/src/index.ts";

const args = Bun.argv.slice(2);
ensure(
  args.length === 2 && args[0] === "--snapshot" && !!args[1],
  "Usage: bun run mcp:smoke --snapshot artifacts/NAME.json (from repository root)",
);
const root = process.cwd(),
  path = args[1];
const snapshot = await loadSnapshot(root, path),
  service = createQueryService(snapshot);
async function inventory() {
  const files = new Set(git(root, ["ls-files", "-z"]).split("\0").filter(Boolean));
  for await (const file of new Bun.Glob("artifacts/**/*").scan({
    cwd: root,
    onlyFiles: true,
    followSymlinks: false,
  }))
    files.add(file);
  for (const file of [
    path,
    "apps/storybook-demo/public/governance-report.json",
    "apps/storybook-demo/storybook-static/governance-report.json",
  ])
    files.add(file);
  const hashes: Record<string, string> = Object.create(null);
  for (const file of [...files].sort()) {
    const target = join(root, file);
    if ((await lstat(target)).isFile()) hashes[file] = bytesDigest(await readFile(target));
  }
  hashes[".git/index"] = await gitIndexDigest(root);
  return hashes;
}
const before = await inventory();
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    "--preload",
    resolve("scripts/mcp-readonly-preload.ts"),
    resolve("packages/mcp/dist/main.mjs"),
    "--root",
    root,
    "--snapshot",
    path,
  ],
  stderr: "pipe",
  // Preserve explicitly configured Git isolation; the SDK inherits only a small allowlist.
  env: {
    ...(process.env.GIT_CONFIG_GLOBAL ? { GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL } : {}),
    ...(process.env.GIT_CONFIG_NOSYSTEM
      ? { GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM }
      : {}),
  },
});
let diagnostics = "";
transport.stderr?.on("data", (chunk) => {
  diagnostics += chunk;
});
const client = new Client({ name: "governator-local-qualification", version: "0.1.0" });
const component = snapshot.payload.registry.components[0],
  baseline = snapshot.payload.baseline,
  candidate = snapshot.payload.candidate;
ensure(!!component && !!baseline && !!candidate, "Smoke requires a full dogfood release snapshot");
const old = baseline.api.components.find((c) => c.componentId === component.id),
  next = candidate.api.components.find((c) => c.componentId === component.id);
ensure(!!old && !!next, "Smoke component must have baseline and candidate contracts");
const base = { componentId: component.id },
  pkg = { packageId: candidate.manifest.name, candidateVersion: candidate.manifest.version };
const requests: Record<string, Record<string, unknown>> = {
  list_components: { limit: 1 },
  get_component: base,
  get_component_evidence: base,
  evaluate_component: { ...base, targetLifecycle: "stable" },
  explain_governance_failure: { ...base, targetLifecycle: "stable" },
  get_design_system_report: {},
  list_approved_components: {},
  get_component_contract: base,
  diff_component_contract: {
    ...base,
    fromVersion: old.contractVersion,
    toVersionOrCandidate: "candidate",
  },
  list_breaking_changes: {},
  explain_release_block: pkg,
  get_release_manifest: { packageId: pkg.packageId, version: pkg.candidateVersion },
  get_consumer_compatibility: pkg,
  plan_component_migration: {
    ...base,
    fromVersion: old.contractVersion,
    toVersion: next.contractVersion,
  },
};
try {
  await client.connect(transport);
  ensure(
    digest((await client.listTools()).tools.map((t) => t.name)) === digest(toolNames),
    "MCP tool discovery mismatch",
  );
  for (const name of toolNames) {
    const expected = service.query(name, requests[name]),
      result = await client.callTool({ name, arguments: requests[name] });
    ensure(
      !result.isError && digest(result.structuredContent) === digest(expected),
      `MCP parity mismatch: ${name}`,
    );
  }
  const cli = await runCli([
    "query",
    "--root",
    root,
    "--snapshot",
    path,
    "--tool",
    "get_design_system_report",
  ]);
  ensure(
    cli.code === 0 && digest(JSON.parse(cli.stdout).data) === digest(snapshot.payload.report),
    "CLI report parity mismatch",
  );
  const storybook = await Bun.file("apps/storybook-demo/public/governance-report.json").json();
  ensure(digest(storybook) === digest(snapshot.payload.report), "Storybook report parity mismatch");
  const staticReport = await Bun.file(
    "apps/storybook-demo/storybook-static/governance-report.json",
  ).json();
  ensure(
    digest(staticReport) === digest(storybook),
    "Static Storybook report parity mismatch; rebuild after generating dogfood reports",
  );
} finally {
  await client.close();
}
const audit = JSON.parse(diagnostics.trim());
ensure(
  audit.readonlyAudit?.serving === true &&
    audit.readonlyAudit.blockedCalls === 0 &&
    audit.readonlyAudit.startupGitReads > 0,
  "Readonly subprocess audit failed",
);
const after = await inventory();
ensure(digest(before) === digest(after), "Source or artifacts changed during read queries");
console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      sourceCommit: snapshot.sourceCommit,
      snapshotDigest: snapshot.digest,
      provenance: snapshot.provenance,
      tools: toolNames.length,
      parity: "CLI / Storybook report / built MCP",
      unchangedFiles: Object.keys(before).length,
      readonlyAudit: audit.readonlyAudit,
      releaseGate: snapshot.payload.release?.gate,
      publication: "unknown",
      deployment: "unknown",
      adoption: "unknown",
    },
    null,
    2,
  ),
);
