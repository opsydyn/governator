import { afterEach, expect, test } from "vitest";
import { writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { createSnapshot, loadSnapshot } from "../packages/query/src/snapshot.ts";
import { digest } from "../packages/core/src/digest.ts";
import { queryProject } from "./query-fixtures.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const f = await queryProject();
  roots.push(f.root);
  const snapshot = await createSnapshot(f.root, { report: "artifacts/report.json" }, f.now);
  await writeFile(join(f.root, "artifacts/snapshot.json"), JSON.stringify(snapshot));
  return { ...f, snapshot };
}
test("loads an immutable selected snapshot without recreating test attestations", async () => {
  const f = await fixture();
  const loaded = await loadSnapshot(f.root, "artifacts/snapshot.json", f.now);
  expect(loaded.payload.report).toEqual(f.report);
  expect(loaded.payload.evidence[0]?.provenance).toBe("demo");
  expect(Object.isFrozen(loaded.payload.report)).toBe(true);
  expect(loaded.provenance).toBe("simulated-snapshot");
});
test("rejects changed source/report, wrong digest/schema and stale/future snapshots", async () => {
  const f = await fixture();
  await expect(
    loadSnapshot(f.root, "artifacts/snapshot.json", f.now + 25 * 3600000),
  ).rejects.toThrow(/stale|expired/i);
  for (const delta of [
    { schemaVersion: 2 },
    { sourceCommit: "b".repeat(40) },
    { generatedAt: "2099-01-01T00:00:00.000Z" },
    {
      payload: { ...f.snapshot.payload, report: { ...f.report, repository: "forged-repository" } },
    },
  ]) {
    const { digest: _hash, ...body } = { ...f.snapshot, ...delta };
    await writeFile(
      join(f.root, "artifacts/bad.json"),
      JSON.stringify({ ...body, digest: digest(body) }),
    );
    await expect(loadSnapshot(f.root, "artifacts/bad.json", f.now)).rejects.toThrow();
  }
  await writeFile(
    join(f.root, "artifacts/report.json"),
    JSON.stringify({ ...f.report, policyVersion: "changed" }),
  );
  await expect(loadSnapshot(f.root, "artifacts/snapshot.json", f.now)).rejects.toThrow(
    /digest|changed|policy/i,
  );
});
test("rejects root escapes, symlinks and oversized snapshot data", async () => {
  const f = await fixture();
  await expect(loadSnapshot(f.root, "../outside.json", f.now)).rejects.toThrow();
  await symlink(join(f.root, "artifacts/snapshot.json"), join(f.root, "artifacts/link.json"));
  await expect(loadSnapshot(f.root, "artifacts/link.json", f.now)).rejects.toThrow(/symlink/i);
  await writeFile(join(f.root, "artifacts/huge.json"), " ".repeat(8 * 1024 * 1024 + 1));
  await expect(loadSnapshot(f.root, "artifacts/huge.json", f.now)).rejects.toThrow(/large|limit/i);
  await writeFile(join(f.root, "fixtures/Button.ts"), "export const dirty=true;");
  await expect(loadSnapshot(f.root, "artifacts/snapshot.json", f.now)).rejects.toThrow(
    /dirty|uncommitted/i,
  );
});
