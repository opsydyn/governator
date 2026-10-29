import { expect, test, afterEach } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { queryProject } from "./query-fixtures.ts";
import { createSnapshot, loadSnapshot } from "../packages/query/src/snapshot.ts";
import { createQueryService } from "../packages/query/src/service.ts";
import { component } from "./fixtures.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(components?: Parameters<typeof queryProject>[0]) {
  const f = await queryProject(components);
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
  expect(() => f.service.query("get_design_system_report", { path: "outside" }, f.now)).toThrow();
});
test("paginates deterministically, supports an empty registry and rejects oversized results", async () => {
  const f = await fixture(
    ["ui.zebra", "ui.alpha", "ui.middle"].map((id) => ({
      ...component,
      id,
      stories: [],
      exportPath: `@example/${id}`,
    })),
  );
  expect(f.service.query("list_components", { limit: 2 }, f.now).data).toMatchObject({
    items: [{ id: "ui.alpha" }, { id: "ui.middle" }],
    total: 3,
    nextCursor: "offset:2",
    truncated: true,
  });
  expect(
    f.service.query("list_components", { limit: 2, cursor: "offset:2" }, f.now).data,
  ).toMatchObject({ items: [{ id: "ui.zebra" }], nextCursor: null, truncated: false });
  expect(() => f.service.query("list_components", { cursor: "offset:4" }, f.now)).toThrow(
    /cursor/i,
  );
  const empty = await fixture([]);
  expect(empty.service.query("list_components", {}, empty.now).data).toMatchObject({
    items: [],
    total: 0,
    nextCursor: null,
  });
  const huge = await fixture([{ ...component, name: "x".repeat(130 * 1024) }]);
  expect(() => huge.service.query("get_component", { componentId: "ui.button" }, huge.now)).toThrow(
    /128 KiB/,
  );
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
test("bounds arguments and never generates migration steps for unavailable comparisons", async () => {
  const f = await fixture();
  expect(() =>
    f.service.query("list_components", { filters: { owner: "x".repeat(9000) } }, f.now),
  ).toThrow(/8 KiB/);
  expect(
    f.service.query(
      "plan_component_migration",
      { componentId: "ui.button", fromVersion: "1.0.0", toVersion: "2.0.0" },
      f.now,
    ),
  ).toMatchObject({ data: { status: "not_configured", suggestions: [], documents: [] } });
});

test("ready-components alias preserves the legacy result without granting approval", async () => {
  const f = await fixture();
  const ready = f.service.query("list_ready_components", { limit: 1 }, f.now);
  const legacy = f.service.query("list_approved_components", { limit: 1 }, f.now);
  expect(ready).toEqual(legacy);
  expect(ready).toMatchObject({ data: { approvalVerified: false } });
});
