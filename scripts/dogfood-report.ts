import { captureCandidate, checkCandidate } from "../packages/cli/src/release.ts";
import { releaseSummary } from "../packages/cli/src/release-summary.ts";
import { runLocalCheck } from "../packages/cli/src/evidence.ts";
import {
  snapshotApi,
  diffApi,
  decodeApiSnapshot,
  checkApiVersions,
} from "../packages/versioning/src/api.ts";
import { decodeReport, ensure } from "../packages/core/src/domain.ts";
import { cleanHead, git } from "../packages/cli/src/source.ts";
import { loadProject } from "../packages/cli/src/files.ts";
import { validateDogfoodInputs } from "./dogfood-inputs.ts";
const head = cleanHead(process.cwd());
for (const path of [
  "governance/api-config.json",
  "governance/api-baselines/ui-8.4.1.json",
  "governance/api-baselines/ui-8.4.1.json.sha256",
  "packages/demo-ui/package.json",
  "packages/demo-ui/tsdown.config.ts",
  "bun.lock",
])
  git(process.cwd(), ["ls-files", "--error-unmatch", "--", path]);
// Rebuild without Moon's cache: ignored or stale declarations cannot supply a source-bound result.
const build = Bun.spawnSync([process.execPath, "run", "build"], {
  cwd: "packages/demo-ui",
  stdout: "pipe",
  stderr: "pipe",
});
ensure(build.exitCode === 0, `Dogfood declaration build failed: ${build.stderr.toString()}`);
const checked = await runLocalCheck(process.cwd(), "governance/tests.json", "stable", 2);
const config = await Bun.file("governance/api-config.json").json();
validateDogfoodInputs(
  config,
  await Bun.file("packages/demo-ui/package.json").json(),
  (await loadProject(process.cwd())).registry,
);
const baseline = decodeApiSnapshot(await Bun.file("governance/api-baselines/ui-8.4.1.json").json());
const candidate = snapshotApi(await Bun.file("packages/demo-ui/dist/index.d.mts").text(), config);
const expected = (await Bun.file("governance/api-baselines/ui-8.4.1.json.sha256").text()).trim();
const diff = diffApi(baseline, candidate, expected);
const versions = checkApiVersions(baseline, candidate, diff);
ensure(
  cleanHead(process.cwd()) === head && checked.report.commit === head,
  "Source changed during dogfood declaration build/test analysis",
);
const captured = await captureCandidate(
  process.cwd(),
  "governance/release.json",
  `artifacts/dogfood-release-${crypto.randomUUID()}`,
);
const release = await checkCandidate(process.cwd(), "governance/release.json", captured.path);
await Bun.write("artifacts/dogfood-release.json", JSON.stringify(release, null, 2) + "\n");
const report = decodeReport({
  ...checked.report,
  release: releaseSummary(release),
  decisions: checked.report.decisions.map((component) => ({
    ...component,
    compatibility: {
      ...versions,
      minimumBump: diff.minimumBump,
      baselineVersion: diff.baselineVersion,
      candidateVersion: diff.candidateVersion,
      baselineContractVersion:
        baseline.components.find((c) => c.componentId === component.componentId)?.contractVersion ??
        component.contractVersion,
      baselineDigest: diff.baselineDigest,
      candidateDigest: diff.candidateDigest,
      changes: diff.changes
        .filter((c) => c.componentId === null || c.componentId === component.componentId)
        .map((c) => c.message),
      limitations: diff.limitations,
    },
  })),
});
await Bun.write(
  "apps/storybook-demo/public/governance-report.json",
  JSON.stringify(report, null, 2) + "\n",
);
await Bun.write("artifacts/dogfood-governance.json", JSON.stringify(report, null, 2) + "\n");
await Bun.write("artifacts/dogfood-api-candidate.json", JSON.stringify(candidate, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      source: report.commit,
      report: "apps/storybook-demo/public/governance-report.json",
      receipt: checked.receiptPath,
      readiness: report.decisions.map((c) => ({
        id: c.componentId,
        gate: c.gate,
        compatibility: c.compatibility?.gate,
      })),
      compatibilityGate: versions.gate,
    },
    null,
    2,
  ),
);
