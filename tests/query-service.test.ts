import { expect, test, afterEach } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { queryProject } from "./query-fixtures.ts";
import { createSnapshot, loadSnapshot } from "../packages/query/src/snapshot.ts";
import { createQueryService } from "../packages/query/src/service.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const f = await queryProject();
  roots.push(f.root);
  const snapshot = await createSnapshot(f.root, { report: "artifacts/report.json" }, f.now);
  await writeFile(join(f.root, "artifacts/snapshot.json"), JSON.stringify(snapshot));
  return {
    ...f,
    service: createQueryService(await loadSnapshot(f.root, "artifacts/snapshot.json", f.now)),
  };
}
test("filters and pages recorded decisions with explicit snapshot provenance", async () => {
  const f = await fixture();
  expect(
    f.service.query("list_components", { filters: { gate: "ready" }, limit: 1 }, f.now),
  ).toMatchObject({
    scope: "recorded-snapshot",
    provenance: "simulated-snapshot",
    data: { items: [{ id: "ui.button", reportedDecision: { gate: "ready" } }], nextCursor: null },
  });
  expect(() => f.service.query("get_component", { componentId: "ui.unknown" }, f.now)).toThrow(
    /component/i,
  );
  expect(() => f.service.query("list_components", { limit: 0 }, f.now)).toThrow();
  expect(() => f.service.query("list_components", { filters: { wat: true } }, f.now)).toThrow();
});
test("separates reported ready from new unverified evaluation and approval", async () => {
  const f = await fixture();
  expect(f.service.query("get_design_system_report", {}, f.now).data).toEqual(f.report);
  expect(
    f.service.query(
      "evaluate_component",
      { componentId: "ui.button", targetLifecycle: "stable" },
      f.now,
    ),
  ).toMatchObject({ scope: "pure-unverified-evaluation", data: { gate: "insufficient_evidence" } });
  expect(f.service.query("list_approved_components", {}, f.now)).toMatchObject({
    data: { approvalVerified: false, classification: "eligible_under_demo_policy" },
  });
  expect(
    f.service.query(
      "explain_release_block",
      { packageId: "@example/ui", candidateVersion: "8.4.2" },
      f.now,
    ),
  ).toMatchObject({ data: { status: "not_configured" } });
  expect(() => f.service.query("get_design_system_report", {}, f.now + 25 * 3600000)).toThrow(
    /stale|expired/i,
  );
});
