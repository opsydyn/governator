import { mkdir, mkdtemp, rm, symlink, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { decode, digest, ensure } from "@governator/core";
import { CandidateManifest, assessRelease, checkConsumers } from "@governator/versioning";
import { inspectArchive, bytesDigest } from "./archive.ts";
import { releaseInputs } from "./release-inputs.ts";
import { containedFile } from "./files.ts";
import { cleanHead, git } from "./source.ts";
import { runLocalCheck } from "./evidence.ts";
import type { CliResult } from "./commands.ts";
async function command(root: string, args: string[]) {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  ensure(code === 0, `Release build/pack failed (${args.join(" ")}): ${stderr || stdout}`);
}
async function outputDirectory(root: string, out: string) {
  ensure(
    /^artifacts\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(out),
    "Candidate output must be a new direct directory under ignored artifacts/",
  );
  ensure(
    Bun.spawnSync(["git", "-C", root, "check-ignore", "--quiet", "--", out]).exitCode === 0,
    "Ignore candidate artifacts/ before capture",
  );
  await mkdir(join(root, "artifacts"), { recursive: true });
  ensure(
    (await realpath(join(root, "artifacts"))) === join(root, "artifacts"),
    "Symlinked candidate artifact directory is forbidden",
  );
  const path = join(root, out);
  await mkdir(path);
  return path;
}
export async function captureCandidate(rootPath: string, configPath: string, out: string) {
  const root = await realpath(rootPath);
  const inputs = await releaseInputs(root, configPath),
    directory = await outputDirectory(root, out);
  const tarball = join(directory, "candidate.tgz");
  // Build in a clean source snapshot: ignored dist/.env files in the working checkout cannot leak in.
  const snapshot = await mkdtemp(join(tmpdir(), "governator-build-"));
  async function buildSnapshot() {
    git(root, ["clone", "--quiet", "--no-hardlinks", "--no-checkout", root, snapshot]);
    git(snapshot, ["checkout", "--quiet", "--detach", inputs.commit]);
    ensure(
      git(snapshot, ["rev-parse", "HEAD"]) === inputs.commit,
      "Build snapshot source mismatch",
    );
    await symlink(join(root, "node_modules"), join(snapshot, "node_modules"));
    const packageRoot = resolve(snapshot, inputs.config.packageDirectory);
    // config.packageDirectory was contained in the source checkout; reject absolute escape here too.
    ensure(
      packageRoot === snapshot || packageRoot.startsWith(snapshot + "/"),
      "Build package escapes snapshot",
    );
    await command(packageRoot, ["run", "build"]);
    await command(packageRoot, [
      "pm",
      "pack",
      "--ignore-scripts",
      "--filename",
      tarball,
      "--quiet",
    ]);
  }
  await buildSnapshot().finally(() => rm(snapshot, { recursive: true, force: true }));
  const packed = await containedFile(root, tarball);
  const file = Bun.file(packed);
  ensure(file.size <= 4 * 1024 * 1024, "Packed candidate exceeds size limit");
  const artifact = await inspectArchive(
    await file.bytes(),
    inputs.apiConfig,
    inputs.config.declaration,
  );
  const after = await releaseInputs(root, configPath);
  ensure(
    after.commit === inputs.commit && after.inputDigest === inputs.inputDigest,
    "Source or release inputs changed during candidate capture",
  );
  const candidate: CandidateManifest = {
    schemaVersion: 1,
    commit: inputs.commit,
    createdAt: new Date().toISOString(),
    config: inputs.configPath,
    inputDigest: inputs.inputDigest,
    tarball: "candidate.tgz",
    artifact,
  };
  const path = join(directory, "candidate.json");
  await writeFile(path, JSON.stringify(candidate, null, 2) + "\n", { flag: "wx" });
  return { candidate, path: relative(root, path) };
}
export async function checkCandidate(
  rootPath: string,
  configPath: string,
  candidatePath: string,
  demo = false,
) {
  const root = await realpath(rootPath);
  const inputs = await releaseInputs(root, configPath),
    path = await containedFile(root, candidatePath),
    manifestFile = Bun.file(path);
  ensure(manifestFile.size <= 4 * 1024 * 1024, "Candidate manifest exceeds size limit");
  const original = await manifestFile.bytes();
  const candidate = decode(CandidateManifest, JSON.parse(new TextDecoder().decode(original)));
  ensure(
    candidate.config === inputs.configPath &&
      candidate.commit === inputs.commit &&
      candidate.inputDigest === inputs.inputDigest,
    "Candidate source or release input digest mismatch",
  );
  const created = Date.parse(candidate.createdAt);
  ensure(
    Number.isFinite(created) &&
      new Date(created).toISOString() === candidate.createdAt &&
      created <= Date.now() &&
      Date.now() - created <= 86_400_000,
    "Candidate is stale or has an invalid/future creation time",
  );
  ensure(candidate.tarball === "candidate.tgz", "Unsupported candidate tarball path");
  const tarball = await containedFile(root, join(path, "..", candidate.tarball));
  ensure(Bun.file(tarball).size <= 4 * 1024 * 1024, "Candidate archive exceeds size limit");
  const bytes = await Bun.file(tarball).bytes();
  ensure(
    bytesDigest(bytes) === candidate.artifact.artifactDigest,
    "Candidate artifact digest changed after capture",
  );
  const actual = await inspectArchive(bytes, inputs.apiConfig, inputs.config.declaration);
  ensure(
    digest(actual) === digest(candidate.artifact),
    "Candidate API/manifest/file report differs from its actual artifact",
  );
  // Reproduce payload from current tracked source; saved metadata alone is never producer proof.
  const reproduced = await captureCandidate(
    root,
    configPath,
    `artifacts/rebuild-${crypto.randomUUID()}`,
  );
  ensure(
    digest({ files: actual.files, manifest: actual.manifest, api: actual.api }) ===
      digest({
        files: reproduced.candidate.artifact.files,
        manifest: reproduced.candidate.artifact.manifest,
        api: reproduced.candidate.artifact.api,
      }),
    "Candidate payload does not reproduce from current tracked source",
  );
  const checked = await runLocalCheck(root, inputs.config.mapping, "stable");
  let review: unknown;
  if (
    inputs.config.simulatedReview &&
    (await Bun.file(resolve(root, inputs.config.simulatedReview)).exists())
  )
    review = await Bun.file(await containedFile(root, inputs.config.simulatedReview)).json();
  const after = await releaseInputs(root, configPath);
  ensure(
    after.commit === inputs.commit &&
      after.inputDigest === inputs.inputDigest &&
      cleanHead(root) === candidate.commit,
    "Source or inputs changed during candidate validation",
  );
  ensure(
    bytesDigest(await Bun.file(path).bytes()) === bytesDigest(original) &&
      bytesDigest(await Bun.file(tarball).bytes()) === actual.artifactDigest,
    "Candidate manifest or artifact changed during validation",
  );
  const consumerDiagnostics = checkConsumers(
    actual.manifest.name,
    actual.api.declaration,
    inputs.consumers,
  );
  const report = assessRelease({
    baseline: inputs.baseline,
    candidate: actual,
    consumerDiagnostics,
    intents: inputs.intents,
    classification: inputs.classification,
    mode: demo ? "demo" : "local",
    commit: inputs.commit,
    at: new Date().toISOString(),
    inputDigest: inputs.inputDigest,
    review,
    documents: inputs.documents,
    localReport: checked.report,
  });
  return {
    ...report,
    consumerChecks: {
      result: consumerDiagnostics.length ? ("failed" as const) : ("passed" as const),
      fixtures: inputs.config.consumerFixtures,
      diagnostics: consumerDiagnostics,
      compilerVersion: actual.api.compilerVersion,
      artifactDigest: actual.artifactDigest,
    },
    candidateManifest: relative(root, path),
    testReceipt: checked.receiptPath,
    reproducedArtifactDigest: reproduced.candidate.artifact.artifactDigest,
    baselineSource: "explicit-local-fixture" as const,
  };
}
export async function runRelease(
  operation: string,
  values: Map<string, string>,
  demo: boolean,
): Promise<CliResult> {
  ensure(
    operation === "candidate" || operation === "plan" || operation === "check",
    "Expected release candidate, plan or check",
  );
  const root = await realpath(resolve(values.get("--root") ?? ".")),
    config = values.get("--config");
  ensure(!!config, "Required option --config");
  if (operation === "candidate") {
    const out = values.get("--out");
    ensure(!!out, "Required option --out");
    const candidate = await captureCandidate(root, config, out);
    return { code: 0, stdout: JSON.stringify(candidate, null, 2) + "\n", stderr: "" };
  }
  let candidate = values.get("--candidate");
  if (!candidate && operation === "plan")
    candidate = (await captureCandidate(root, config, `artifacts/plan-${crypto.randomUUID()}`))
      .path;
  ensure(!!candidate, "Required option --candidate");
  const report = await checkCandidate(root, config, candidate, demo);
  return {
    code: report.gate === "ready" ? 0 : 1,
    stdout: JSON.stringify(report, null, 2) + "\n",
    stderr: "",
  };
}
