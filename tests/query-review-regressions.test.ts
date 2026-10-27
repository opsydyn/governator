import { afterEach, expect, test } from "vitest";
import { rm, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { queryProject } from "./query-fixtures.ts";
import { releaseProject, review } from "./release-fixtures.ts";
import { captureCandidate, checkCandidate } from "../packages/cli/src/release.ts";
import { releaseSummary } from "../packages/cli/src/release-summary.ts";
import { createSnapshot, loadSnapshot, createQueryService } from "../packages/query/src/index.ts";
import { cleanHead } from "../packages/query/src/io.ts";
import { runCli } from "../packages/cli/src/index.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const selection = {
  report: "artifacts/report.json",
  release: "artifacts/release.json",
  config: "governance/release.json",
};
async function released(unbumped = false) {
  const root = await releaseProject(false, unbumped);
  roots.push(root);
  const captured = await captureCandidate(root, "governance/release.json", "artifacts/candidate");
  await review(root);
  const release = await checkCandidate(root, "governance/release.json", captured.path, true);
  const report = JSON.parse(
    (await runCli(["evaluate", "--root", root, "--format", "json"])).stdout,
  );
  return { root, release, report, captured };
}
async function save(f: Awaited<ReturnType<typeof released>>, now: number) {
  await writeFile(
    join(f.root, selection.report),
    JSON.stringify({ ...f.report, release: releaseSummary(f.release) }),
  );
  await writeFile(join(f.root, selection.release), JSON.stringify(f.release));
  await writeFile(
    join(f.root, "artifacts/snapshot.json"),
    JSON.stringify(await createSnapshot(f.root, selection, now)),
  );
  return createQueryService(await loadSnapshot(f.root, "artifacts/snapshot.json", now));
}
test("rejects effective Git clean/process filters before any configured command executes", async () => {
  const f = await queryProject();
  roots.push(f.root);
  await writeFile(join(f.root, ".gitattributes"), "fixtures/Button.ts filter=review\n");
  execFileSync("git", ["-C", f.root, "add", ".gitattributes"]);
  execFileSync("git", [
    "-C",
    f.root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "Filter fixture",
  ]);
  const hook = join(f.root, "artifacts/filter.sh"),
    marker = join(f.root, "artifacts/filter-ran");
  await writeFile(hook, `#!/bin/sh\ntouch '${marker}'\ncat\n`, { mode: 0o755 });
  for (const kind of ["clean", "process"]) {
    execFileSync("git", ["-C", f.root, "config", `filter.review.${kind}`, hook]);
    await utimes(join(f.root, "fixtures/Button.ts"), new Date(), new Date(Date.now() + 2000));
    expect(() => cleanHead(f.root)).toThrow(/filter/i);
    expect(await Bun.file(marker).exists()).toBe(false);
    execFileSync("git", ["-C", f.root, "config", "--unset", `filter.review.${kind}`]);
  }
});
test("rejects Git links before status can recurse into nested repository configuration", async () => {
  const f = await queryProject();
  roots.push(f.root);
  execFileSync("git", [
    "-C",
    f.root,
    "update-index",
    "--add",
    "--cacheinfo",
    `160000,${f.commit},nested`,
  ]);
  execFileSync("git", [
    "-C",
    f.root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "Gitlink fixture",
  ]);
  expect(() => cleanHead(f.root)).toThrow(/submodule|gitlink/i);
});
test.each(["candidate", "release"])(
  "preserves earliest %s expiry on reload and every query",
  async (kind) => {
    const f = await released(),
      now = Date.now(),
      old = new Date(now - 23 * 3600000).toISOString();
    if (kind === "candidate")
      await writeFile(
        join(f.root, f.captured.path),
        JSON.stringify({ ...f.captured.candidate, createdAt: old }),
      );
    else f.release = { ...f.release, evaluatedAt: old };
    const service = await save(f, now);
    expect(() =>
      service.query(
        "explain_release_block",
        { packageId: "@test/ui", candidateVersion: "1.0.1" },
        now + 2 * 3600000,
      ),
    ).toThrow(/stale|expired/i);
    await expect(
      loadSnapshot(f.root, "artifacts/snapshot.json", now + 2 * 3600000),
    ).rejects.toThrow(/stale|expired/i);
  },
  30000,
);
test("explicit colliding contract versions are unavailable while candidate selection stays usable", async () => {
  const f = await released(true),
    service = await save(f, Date.now()),
    base = { componentId: "ui.button" };
  expect(
    service.query("get_component_contract", { ...base, contractVersion: "1.0.0" }).data,
  ).toMatchObject({
    status: "unavailable",
    reason: "ambiguous_contract_version",
    availableSources: expect.any(Array),
  });
  expect(service.query("get_component_contract", base).data).toMatchObject({
    status: "available",
    source: "recorded-candidate",
    contract: { props: { variant: { optional: false } } },
  });
  expect(
    service.query("diff_component_contract", {
      ...base,
      fromVersion: "1.0.0",
      toVersionOrCandidate: "1.0.0",
    }).data,
  ).toMatchObject({ status: "unavailable", reason: "ambiguous_contract_version" });
  expect(
    service.query("diff_component_contract", {
      ...base,
      fromVersion: "1.0.0",
      toVersionOrCandidate: "candidate",
    }).data,
  ).toMatchObject({ status: "available", minimumBump: "major" });
  expect(
    service.query("plan_component_migration", { ...base, fromVersion: "1.0.0", toVersion: "1.0.0" })
      .data,
  ).toMatchObject({
    status: "unavailable",
    reason: "ambiguous_contract_version",
    suggestions: [],
    documents: [],
  });
}, 30000);
