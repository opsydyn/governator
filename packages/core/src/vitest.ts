import { decode, decodeRegistry, ensure, safeRelativePath, unique, Commit } from "./domain.ts";
import type { Evidence, Registry } from "./domain.ts";
import { TestMap, decodeVitestReport } from "./vitest-schema.ts";
import { digest } from "./digest.ts";
export { TestMap } from "./vitest-schema.ts";

export function testPath(path: string, root?: string): string {
  const normalized = path.replaceAll("\\", "/");
  const base = root?.replaceAll("\\", "/").replace(/\/$/, "");
  const local =
    base && normalized.startsWith(`${base}/`) ? normalized.slice(base.length + 1) : normalized;
  safeRelativePath(local);
  const canonical = local
    .split("/")
    .filter((segment) => segment !== "." && segment !== "")
    .join("/");
  ensure(canonical.length > 0, `Invalid test path: ${path}`);
  return canonical;
}
export function decodeTestMap(raw: unknown, registry: Registry): TestMap {
  const map = decode(TestMap, raw);
  unique(
    map.mappings.map((m) => m.componentId),
    "component test mapping",
  );
  for (const mapping of map.mappings) {
    ensure(
      registry.components.some((c) => c.id === mapping.componentId),
      `Unknown mapped component: ${mapping.componentId}`,
    );
    mapping.files.forEach((file) =>
      ensure(testPath(file) === file, `Test mapping needs a canonical relative path: ${file}`),
    );
    unique(mapping.files, "mapped test file");
  }
  return map;
}
export interface ImportContext {
  readonly root: string;
  readonly registry: Registry;
  readonly mapping: unknown;
  readonly commit: string;
  readonly repository: string;
}
export interface VitestImport {
  readonly schemaVersion: 1;
  readonly format: "vitest-json-v4";
  readonly reportDigest: string;
  readonly source: {
    readonly commit: string;
    readonly repository: string;
    readonly association: "declared";
  };
  readonly evidence: readonly Evidence[];
  readonly missing: readonly { readonly componentId: string; readonly reason: string }[];
  readonly files: readonly string[];
  readonly runStartedAt: number;
  readonly runFinishedAt: number;
  readonly runnerSucceeded: boolean;
}
export function importVitest(rawReport: unknown, context: ImportContext): VitestImport {
  const registry = decodeRegistry(context.registry);
  decode(Commit, context.commit);
  ensure(context.repository.length > 0, "Repository identity is required");
  const mapping = decodeTestMap(context.mapping, registry);
  const report = decodeVitestReport(rawReport);
  const assertions = report.testResults.flatMap((file) => file.assertionResults);
  ensure(
    report.numTotalTests === assertions.length,
    "Vitest test count does not match assertion results",
  );
  ensure(
    report.numTotalTests ===
      report.numPassedTests + report.numFailedTests + report.numPendingTests + report.numTodoTests,
    "Contradictory Vitest summary counts",
  );
  ensure(
    report.numPassedTests === assertions.filter((a) => a.status === "passed").length &&
      report.numFailedTests === assertions.filter((a) => a.status === "failed").length,
    "Vitest outcome counts do not match assertions",
  );
  ensure(
    !report.success ||
      (report.numFailedTests === 0 &&
        report.numFailedTestSuites === 0 &&
        !report.snapshot.failure &&
        report.testResults.every((file) => file.status === "passed")),
    "Vitest success contradicts reported failure",
  );
  const files = report.testResults.map((file) => ({
    path: testPath(file.name, context.root),
    result: file,
  }));
  unique(
    files.map((file) => file.path),
    "Vitest file result",
  );
  for (const file of files) {
    ensure(
      file.result.endTime >= file.result.startTime && file.result.startTime >= report.startTime,
      "Vitest file times contradict run start/end",
    );
    ensure(
      file.result.status !== "passed" ||
        file.result.assertionResults.every((a) => a.status !== "failed"),
      "Passing Vitest suite contains failed assertions",
    );
  }
  const reportDigest = digest(rawReport);
  const evidence: Evidence[] = [];
  const missing: { componentId: string; reason: string }[] = [];
  for (const entry of [...mapping.mappings].sort((a, b) =>
    a.componentId < b.componentId ? -1 : 1,
  )) {
    const selected = files.filter((file) => entry.files.includes(file.path));
    const failed =
      selected.some(
        (file) =>
          file.result.status === "failed" ||
          file.result.assertionResults.some((a) => a.status === "failed"),
      ) || report.snapshot.failure;
    const complete =
      selected.length === entry.files.length &&
      selected.every(
        (file) =>
          file.result.assertionResults.length > 0 &&
          file.result.assertionResults.every((a) => a.status === "passed"),
      );
    if (!failed && (!complete || (!report.success && report.numFailedTests === 0))) {
      missing.push({
        componentId: entry.componentId,
        reason:
          "Required mapped tests are missing, empty, skipped, unfinished or affected by an unattributed runner failure",
      });
      continue;
    }
    const observed = Math.max(report.startTime, ...selected.map((file) => file.result.endTime));
    evidence.push({
      schemaVersion: 1,
      id: `vitest:${entry.componentId}:${reportDigest.slice(7, 23)}`,
      componentId: entry.componentId,
      check: "unit-test",
      producer: "vitest",
      outcome: failed ? "failed" : "passed",
      provenance: "unverified",
      commit: context.commit,
      repository: context.repository,
      observedAt: new Date(observed).toISOString(),
    });
  }
  return {
    schemaVersion: 1,
    format: "vitest-json-v4",
    reportDigest,
    source: { commit: context.commit, repository: context.repository, association: "declared" },
    evidence,
    missing,
    files: files.map((file) => file.path).sort(),
    runStartedAt: report.startTime,
    runFinishedAt: Math.max(report.startTime, ...report.testResults.map((file) => file.endTime)),
    runnerSucceeded: report.success,
  };
}
