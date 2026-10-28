import { expect, test } from "vitest";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

test("historical release intents are archived outside the active Changesets queue", async () => {
  const active = (await readdir(join(root, ".changeset"))).filter(
    (name) => name.endsWith(".md") && name !== "README.md",
  );
  const archived = await readdir(join(root, "fixtures/release-intent/history"));
  expect(active.filter((name) => archived.includes(name))).toEqual([]);
  expect(archived).toContain("dogfood-breaking-button.md");
  expect(archived).toContain("m0-foundation.md");
  const config = await Bun.file(join(root, "governance/release.json")).json();
  expect(config.changesets.sort()).toEqual(active.map((name) => `.changeset/${name}`).sort());
});
