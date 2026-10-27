import { basename, dirname, join, relative, resolve } from "node:path";
import { mkdir, mkdtemp, realpath, readFile } from "node:fs/promises";
import { ensure, decodeTestMap, importVitest, digest, evaluate } from "@governanator/core";
import type { Evidence } from "@governanator/core";
import { containedFile, loadProject } from "./files.ts";
import { cleanHead, git } from "./source.ts";

type Project = Awaited<ReturnType<typeof loadProject>>;
export async function readMappedTests(root: string, project: Project, path: string) {
  const mapping = decodeTestMap(
    JSON.parse(await readFile(await containedFile(root, path), "utf8")),
    project.registry,
  );
  for (const entry of mapping.mappings)
    for (const file of entry.files) await containedFile(root, file);
  return mapping;
}
export async function runLocalCheck(
  rootPath: string,
  mappingPath: string,
  target: string,
  reportVersion: 1 | 2 = 1,
) {
  const root = await realpath(rootPath);
  const commit = cleanHead(root);
  const project = await loadProject(root);
  const mapping = await readMappedTests(root, project, mappingPath);
  const config = await containedFile(root, "vitest.config.ts");
  const testFiles = [...new Set(mapping.mappings.flatMap((m) => m.files))].sort();
  const optionalGovernance = [];
  for (const path of ["governance/evidence.json", "governance/waivers.json"])
    if (await Bun.file(join(root, path)).exists()) optionalGovernance.push(path);
  for (const path of [
    "governance/components.yaml",
    "governance/policy.yaml",
    ...optionalGovernance,
    mappingPath,
    "vitest.config.ts",
    "package.json",
    ...testFiles,
    ...project.registry.components.flatMap((c) => [c.source, ...c.stories]),
  ])
    git(root, ["ls-files", "--error-unmatch", "--", path]);
  const packagePath = Bun.resolveSync("vitest/package.json", root);
  const runnerPackage: { version?: unknown } = await Bun.file(packagePath).json();
  ensure(
    typeof runnerPackage.version === "string" && runnerPackage.version.startsWith("4."),
    "Local check currently supports installed Vitest 4 only",
  );
  const executable = join(dirname(packagePath), "vitest.mjs");
  const declared: {
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  } = await Bun.file(join(root, "package.json")).json();
  ensure(
    !!(declared.devDependencies?.vitest ?? declared.dependencies?.vitest),
    "Target project must declare its Vitest dependency",
  );
  const artifacts = join(root, "artifacts");
  ensure(
    Bun.spawnSync([
      "git",
      "-C",
      root,
      "check-ignore",
      "--quiet",
      "--",
      "artifacts/governanator-run",
    ]).exitCode === 0,
    "Ignore artifacts/ in Git before running local checks",
  );
  await mkdir(artifacts, { recursive: true });
  ensure(
    (await realpath(artifacts)) === artifacts,
    "Symlinked artifact directories are unsupported",
  );
  const runDir = await mkdtemp(join(artifacts, "governanator-run-"));
  const reportPath = join(runDir, "vitest.json");
  const startedAt = Date.now();
  const child = Bun.spawn(
    [
      process.execPath,
      executable,
      "run",
      "--config",
      config,
      "--reporter=json",
      "--outputFile",
      reportPath,
      ...testFiles.map((file) => resolve(root, file)),
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 30_000 },
  );
  const [exitCode] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const finishedAt = Date.now();
  ensure(
    exitCode === 0 || exitCode === 1,
    "Vitest runner failed or timed out before completing a valid run",
  );
  ensure(cleanHead(root) === commit, "Git HEAD changed during local test execution");
  // Revalidate source, config, mappings and files after execution, including symlink changes.
  await loadProject(root);
  await containedFile(root, "vitest.config.ts");
  await readMappedTests(root, project, mappingPath);
  const imported = importVitest(
    JSON.parse(await readFile(await containedFile(root, relative(root, reportPath)), "utf8")),
    { root, registry: project.registry, mapping, commit, repository: `local:${basename(root)}` },
  );
  ensure(
    imported.runStartedAt >= startedAt - 1_000 && imported.runFinishedAt <= finishedAt + 1_000,
    "Vitest report time is outside the host-observed local run",
  );
  ensure(
    imported.runnerSucceeded === (exitCode === 0),
    "Vitest exit code contradicts the generated report",
  );
  ensure(
    imported.files.every((file) => testFiles.includes(file)),
    "Vitest ran unexpected unmapped test files",
  );
  const evidence: Evidence[] = imported.evidence.map((item) => ({
    ...item,
    provenance: "adapter",
    sourceUrl: relative(root, reportPath),
  }));
  const attestations = Object.fromEntries(evidence.map((item) => [item.id, digest(item)]));
  const report = evaluate(
    {
      ...project,
      evidence: [...project.evidence, ...evidence],
      target,
      at: new Date(finishedAt).toISOString(),
      commit,
      repository: `local:${basename(root)}`,
      mode: "verified",
      verifiedEvidenceDigests: attestations,
      verifiedWaiverDigests: {},
    },
    reportVersion,
  );
  const receiptPath = relative(root, join(runDir, "receipt.json"));
  await Bun.write(
    resolve(root, receiptPath),
    JSON.stringify(
      {
        schemaVersion: 1,
        assurance: "local-process",
        commit,
        repository: `local:${basename(root)}`,
        runner: { name: "vitest", version: runnerPackage.version },
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        exitCode,
        reportPath: relative(root, reportPath),
        reportDigest: imported.reportDigest,
        evidence,
        missing: imported.missing,
      },
      null,
      2,
    ) + "\n",
  );
  return { report, receiptPath };
}
