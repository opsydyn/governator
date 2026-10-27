import { realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  decode,
  decodeRegistry,
  decodePolicy,
  decodeReport,
  Evidence,
  digest,
  validTimestamp,
  unique,
} from "@governanator/core";
import type { ReleaseArtifact } from "@governanator/versioning";
import { CandidateManifest, diffApi } from "@governanator/versioning";
import { Snapshot, SnapshotBody, RecordedRelease, queryEnsure, freeze } from "./domain.ts";
import type { SnapshotSelection, QuerySnapshot } from "./domain.ts";
import { loadProject, containedFile, cleanHead, git } from "./io.ts";
import { inspectArchive, bytesDigest } from "./archive.ts";
import { releaseInputs } from "./release-inputs.ts";
import { assertSafeApi } from "./api-safety.ts";
function currentTime(value: string, now: number, label: string) {
  validTimestamp(value);
  const time = Date.parse(value);
  queryEnsure(
    Number.isFinite(now) && time <= now + 60_000 && now - time <= 86_400_000,
    `${label} is stale, expired or future`,
    "stale_snapshot",
  );
}
export async function createSnapshot(
  rootPath: string,
  selection: SnapshotSelection,
  now = Date.now(),
): Promise<Snapshot> {
  const root = await realpath(rootPath),
    commit = cleanHead(root),
    project = await loadProject(root);
  queryEnsure(
    !!selection.release === !!selection.config,
    "Release and config must be selected together",
  );
  const files: { path: string; kind: string; size: number; digest: string }[] = [];
  const seen = new Set<string>();
  let total = 0;
  async function read(path: string, kind: string, tracked = false): Promise<Uint8Array> {
    const target = await containedFile(root, path),
      key = relative(root, target);
    queryEnsure(
      !key.startsWith(".git/") && key !== ".git",
      "Git internals are not snapshot inputs",
    );
    if (tracked) git(root, ["ls-files", "--error-unmatch", "--", key]);
    const file = Bun.file(target),
      limit = kind === "document" ? 256 * 1024 : 4 * 1024 * 1024;
    queryEnsure(file.size <= limit, `Snapshot input exceeds size limit: ${key}`);
    const bytes = await file.bytes();
    queryEnsure(bytes.length <= limit, `Snapshot input exceeds size limit: ${key}`);
    total += bytes.length;
    queryEnsure(total <= 32 * 1024 * 1024 && files.length < 128, "Snapshot input budget exceeded");
    if (!seen.has(key)) {
      files.push({ path: key, kind, size: bytes.length, digest: bytesDigest(bytes) });
      seen.add(key);
    }
    return bytes;
  }
  async function json(path: string, kind: string, tracked = false): Promise<unknown> {
    return JSON.parse(new TextDecoder().decode(await read(path, kind, tracked)));
  }
  await read("governance/components.yaml", "registry", true);
  await read("governance/policy.yaml", "policy", true);
  for (const path of ["governance/evidence.json", "governance/waivers.json"])
    if (await Bun.file(resolve(root, path)).exists()) await read(path, "evaluation-input", true);
  for (const component of project.registry.components)
    for (const path of [component.source, ...component.stories]) await read(path, "source", true);
  const report = decodeReport(await json(selection.report, "report"));
  currentTime(report.evaluatedAt, now, "Report");
  const freshnessTimes = [now, Date.parse(report.evaluatedAt)];
  queryEnsure(
    report.commit === commit && report.policyVersion === project.policy.policyVersion,
    "Report source or policy does not match current source",
  );
  unique(
    report.decisions.map((c) => c.componentId),
    "report component",
  );
  queryEnsure(
    report.decisions.length === project.registry.components.length,
    "Report must cover the full registry",
  );
  for (const component of project.registry.components)
    queryEnsure(
      report.decisions.some(
        (c) =>
          c.componentId === component.id &&
          c.lifecycle === component.lifecycle &&
          c.package === component.package &&
          c.contractVersion === component.contractVersion &&
          c.packageVersion === (component.packageVersion ?? null),
      ),
      "Report registry/version scope mismatch",
    );
  let baseline: ReleaseArtifact | null = null,
    candidate: ReleaseArtifact | null = null,
    release: typeof RecordedRelease.Type | null = null;
  const documents: Record<string, string> = Object.create(null);
  const reportedEvidence: (typeof Evidence.Type)[] = [];
  if (selection.config && selection.release) {
    const inputs = await releaseInputs(root, selection.config, { safeDeclarations: true });
    release = decode(RecordedRelease, await json(selection.release, "release"));
    currentTime(release.evaluatedAt, now, "Release report");
    freshnessTimes.push(Date.parse(release.evaluatedAt));
    queryEnsure(
      release.sourceCommit === commit && release.inputDigest === inputs.inputDigest,
      "Release source or inputs digest mismatch",
    );
    const saved = decode(
      CandidateManifest,
      await json(release.candidateManifest, "candidate-manifest"),
    );
    currentTime(saved.createdAt, now, "Candidate");
    freshnessTimes.push(Date.parse(saved.createdAt));
    queryEnsure(
      saved.commit === commit &&
        saved.config === inputs.configPath &&
        saved.inputDigest === inputs.inputDigest &&
        saved.tarball === "candidate.tgz",
      "Candidate metadata scope mismatch",
    );
    const archive = resolve(root, release.candidateManifest, "..", saved.tarball);
    candidate = await inspectArchive(
      await read(archive, "candidate-archive"),
      inputs.apiConfig,
      inputs.config.declaration,
      true,
    );
    baseline = inputs.baseline;
    queryEnsure(
      digest(candidate) === digest(saved.artifact) &&
        candidate.artifactDigest === release.candidateDigest &&
        baseline.artifactDigest === release.baselineDigest &&
        release.packageId === candidate.manifest.name &&
        release.candidateVersion === candidate.manifest.version &&
        release.baselineVersion === baseline.manifest.version,
      "Release artifact/API identity mismatch",
    );
    if (release.consumerChecks)
      queryEnsure(
        release.consumerChecks.artifactDigest === candidate.artifactDigest &&
          release.consumerChecks.compilerVersion === candidate.api.compilerVersion &&
          digest(release.consumerChecks.fixtures) === digest(inputs.config.consumerFixtures),
        "Consumer compile record scope mismatch",
      );
    const summary = report.release,
      selectedRelease = release;
    queryEnsure(
      !!summary &&
        Object.entries(summary).every(
          ([key, value]) =>
            digest(value) === digest(selectedRelease[key as keyof typeof selectedRelease]),
        ),
      "Governance and release summaries disagree",
    );
    const config = inputs.config;
    for (const path of [
      inputs.configPath,
      config.apiConfig,
      config.baseline,
      config.baselineArchive,
      config.baselineDigest,
      config.mapping,
      ...config.changesets,
      ...config.consumerFixtures,
      ...(config.classification ? [config.classification] : []),
    ])
      await read(path, "release-input", true);
    for (const path of [
      "package.json",
      "bun.lock",
      "tsconfig.json",
      `${config.packageDirectory}/package.json`,
      `${config.packageDirectory}/tsdown.config.ts`,
    ])
      if (await Bun.file(resolve(root, path)).exists()) await read(path, "build-input", true);
    for (const path of Object.values(inputs.classification?.documents ?? {}))
      documents[path] = new TextDecoder().decode(await read(path, "document", true));
    const receipt = await json(release.testReceipt, "receipt");
    queryEnsure(
      !!receipt &&
        typeof receipt === "object" &&
        "commit" in receipt &&
        receipt.commit === commit &&
        "evidence" in receipt &&
        Array.isArray(receipt.evidence),
      "Receipt source/evidence mismatch",
    );
    for (const raw of receipt.evidence) {
      const item = decode(Evidence, raw);
      queryEnsure(item.commit === commit, "Receipt evidence source mismatch");
      reportedEvidence.push(item);
    }
  }
  const provenance =
    report.assurance === "demo" || release?.assurance === "simulated"
      ? ("simulated-snapshot" as const)
      : ("unverified-snapshot" as const);
  const body = decode(SnapshotBody, {
    schemaVersion: 1,
    sourceCommit: commit,
    repository: report.repository,
    policyVersion: report.policyVersion,
    generatedAt: new Date(now).toISOString(),
    expiresAt: new Date(Math.min(...freshnessTimes) + 86_400_000).toISOString(),
    evaluatedAt: report.evaluatedAt,
    provenance,
    selection: {
      report: relative(root, await containedFile(root, selection.report)),
      release: selection.release
        ? relative(root, await containedFile(root, selection.release))
        : null,
      config: selection.config ? relative(root, await containedFile(root, selection.config)) : null,
    },
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    payload: {
      report,
      registry: project.registry,
      policy: project.policy,
      evidence: project.evidence,
      reportedEvidence,
      waivers: project.waivers,
      baseline,
      candidate,
      release,
      documents,
    },
  });
  queryEnsure(cleanHead(root) === commit, "Source changed while loading snapshot");
  const result = { ...body, digest: digest(body) };
  queryEnsure(
    new TextEncoder().encode(JSON.stringify(result)).length <= 8 * 1024 * 1024,
    "Snapshot exceeds 8 MiB size limit",
  );
  return freeze(result);
}
export async function loadSnapshot(
  rootPath: string,
  path: string,
  now = Date.now(),
): Promise<QuerySnapshot> {
  const root = await realpath(rootPath),
    file = Bun.file(await containedFile(root, path));
  queryEnsure(file.size <= 8 * 1024 * 1024, "Snapshot exceeds 8 MiB size limit");
  const snapshot = decode(Snapshot, await file.json());
  decodeReport(snapshot.payload.report);
  const { digest: expected, ...body } = snapshot;
  queryEnsure(digest(body) === expected, "Snapshot digest mismatch");
  currentTime(snapshot.generatedAt, now, "Snapshot");
  currentTime(snapshot.evaluatedAt, now, "Snapshot evidence");
  validTimestamp(snapshot.expiresAt);
  queryEnsure(
    now <= Date.parse(snapshot.expiresAt),
    "Snapshot candidate or release is stale or expired",
    "stale_snapshot",
  );
  decodeRegistry(snapshot.payload.registry);
  decodePolicy(snapshot.payload.policy);
  const selection: SnapshotSelection = {
    report: snapshot.selection.report,
    ...(snapshot.selection.release ? { release: snapshot.selection.release } : {}),
    ...(snapshot.selection.config ? { config: snapshot.selection.config } : {}),
  };
  const actual = await createSnapshot(root, selection, Date.parse(snapshot.generatedAt));
  queryEnsure(
    actual.digest === snapshot.digest,
    "Snapshot source, referenced bytes or input digest changed",
  );
  const { baseline, candidate } = actual.payload;
  if (baseline) assertSafeApi(baseline.api.declaration);
  if (candidate) assertSafeApi(candidate.api.declaration);
  const computedDiff =
    baseline && candidate ? diffApi(baseline.api, candidate.api, digest(baseline.api)) : null;
  return freeze({ ...actual, computedDiff });
}
