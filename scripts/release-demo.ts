import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { ensure } from "../packages/core/src/index.ts";
import { loadProject } from "../packages/cli/src/files.ts";
import { captureCandidate, checkCandidate } from "../packages/cli/src/release.ts";
import { runCli } from "../packages/cli/src/index.ts";
import { releaseSummary } from "../packages/cli/src/release-summary.ts";
import { createSnapshot, loadSnapshot, createQueryService } from "../packages/query/src/index.ts";
import { digest } from "../packages/core/src/index.ts";
const source = process.cwd();
const root = await mkdtemp(join(tmpdir(), "governator-release-demo-"));
function git(args: string[], cwd = root) {
  const child = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  ensure(child.exitCode === 0, child.stderr.toString());
  return child.stdout.toString().trim();
}
git(["clone", "--quiet", "--no-hardlinks", source, root], source);
git(["remote", "remove", "origin"]);
await symlink(join(source, "node_modules"), join(root, "node_modules"));
await writeFile(join(root, ".git/info/exclude"), "node_modules\n");
// The intentionally invalid declaration belongs only to this disposable simulation.
const releaseConfig = await Bun.file(join(root, "governance/release.json")).json();
releaseConfig.changesets = [".changeset/dogfood-breaking-button.md"];
await writeFile(
  join(root, "governance/release.json"),
  JSON.stringify(releaseConfig, null, 2) + "\n",
);
const results: Record<string, unknown> = {};
for (const bump of ["patch", "minor", "major"] as const) {
  const version = bump === "major" ? "9.0.0" : bump === "minor" ? "8.5.0" : "8.4.2";
  const contract = bump === "major" ? "2.0.0" : bump === "minor" ? "1.3.0" : "1.2.1";
  const manifest = await Bun.file(join(root, "packages/demo-ui/package.json")).json();
  manifest.version = version;
  await writeFile(
    join(root, "packages/demo-ui/package.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const api = await Bun.file(join(root, "governance/api-config.json")).json();
  api.packageVersion = version;
  for (const component of api.components)
    if (component.componentId === "ui.button") component.contractVersion = contract;
  await writeFile(join(root, "governance/api-config.json"), JSON.stringify(api, null, 2) + "\n");
  const project = await loadProject(root);
  const registry = {
    ...project.registry,
    components: project.registry.components.map((c) => ({
      ...c,
      packageVersion: version,
      contractVersion: c.id === "ui.button" ? contract : c.contractVersion,
    })),
  };
  await writeFile(
    join(root, "governance/components.yaml"),
    JSON.stringify(registry, null, 2) + "\n",
  );
  await writeFile(
    join(root, ".changeset/dogfood-breaking-button.md"),
    `---\n"@example/ui": ${bump}\n---\nMigrate Button tone to variant with the included manual plan.\n`,
  );
  git(["add", "."]);
  git([
    "-c",
    "user.name=Governator local simulation",
    "-c",
    "user.email=simulation@example.invalid",
    "commit",
    "--allow-empty",
    "-qm",
    `Simulated ${bump} candidate`,
  ]);
  const captured = await captureCandidate(root, "governance/release.json", `artifacts/${bump}`);
  if (bump === "major") {
    const missing = await checkCandidate(root, "governance/release.json", captured.path, true);
    ensure(missing.gate !== "ready", "Major without current exact review must be blocked");
    results.majorWithoutReview = { gate: missing.gate, reasons: missing.reasons };
  }
  await mkdir(join(root, "artifacts"), { recursive: true });
  await writeFile(
    join(root, "artifacts/simulated-release-review.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        provenance: "simulated",
        commit: captured.candidate.commit,
        artifactDigest: captured.candidate.artifact.artifactDigest,
        inputDigest: captured.candidate.inputDigest,
        reviewer: "fixture:design-system-owner",
        roles: ["design-system-owner", "api-owner"],
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        reason:
          "Simulated owner reviewed the exact tarball, migration plan, known consumer and compatibility matrix.",
      },
      null,
      2,
    ) + "\n",
  );
  const checked = await checkCandidate(root, "governance/release.json", captured.path, true);
  ensure(
    bump === "major"
      ? checked.gate === "ready" && checked.status === "eligible_under_demo_policy"
      : checked.gate === "blocked",
    `${bump} simulation returned unexpected gate: ${checked.gate}: ${checked.reasons.join("; ")}`,
  );
  ensure(
    checked.publishable === false &&
      checked.publication === "unknown" &&
      checked.deployment === "unknown",
    "Simulation must never imply publication/deployment authorization",
  );
  results[bump] = {
    gate: checked.gate,
    status: checked.status,
    sourceCommit: checked.sourceCommit,
    candidateDigest: checked.candidateDigest,
    reasons: checked.reasons,
    candidateManifest: resolve(root, captured.path),
    testReceipt: resolve(root, checked.testReceipt),
  };
  const observed = JSON.parse(
    (await runCli(["evaluate", "--root", root, "--format", "json"])).stdout,
  );
  await writeFile(
    join(root, "artifacts/query-report.json"),
    JSON.stringify({ ...observed, release: releaseSummary(checked) }),
  );
  await writeFile(join(root, "artifacts/query-release.json"), JSON.stringify(checked));
  const selected = await createSnapshot(root, {
    report: "artifacts/query-report.json",
    release: "artifacts/query-release.json",
    config: "governance/release.json",
  });
  await writeFile(join(root, "artifacts/query-snapshot.json"), JSON.stringify(selected));
  const queried = createQueryService(
    await loadSnapshot(root, "artifacts/query-snapshot.json"),
  ).query("explain_release_block", {
    packageId: checked.packageId,
    candidateVersion: checked.candidateVersion,
  });
  ensure(
    digest(queried.data) === digest(checked) && queried.provenance === "simulated-snapshot",
    `${bump} query changed recorded release/provenance`,
  );
  if (bump === "major") {
    const normal = await checkCandidate(root, "governance/release.json", captured.path, false);
    ensure(normal.gate !== "ready", "Normal release must reject simulated owner review");
    results.normalMajor = { gate: normal.gate, reasons: normal.reasons };
    await writeFile(join(root, "artifacts/major/candidate.tgz"), "tampered exact candidate");
    const tampered = await runCli([
      "release",
      "check",
      "--root",
      root,
      "--config",
      "governance/release.json",
      "--candidate",
      captured.path,
      "--demo",
    ]);
    ensure(
      tampered.code === 2 && /digest/.test(tampered.stderr),
      "Changed artifact must be rejected",
    );
    results.tamperedArtifact = { exitCode: tampered.code, reason: tampered.stderr.trim() };
  }
}
const report = {
  schemaVersion: 1,
  assurance: "simulated",
  publication: "unknown",
  deployment: "unknown",
  publishable: false,
  root,
  results,
};
await Bun.write(
  join(source, "artifacts/release-demo.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
