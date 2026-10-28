import { chmod, lstat, mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  getComponentTags,
  saveComponentTags,
} from "../packages/storybook-addon/src/tag-storage.ts";

test("writes component tags and rejects stale edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "governator-tag-test-"));
  await mkdir(join(root, "src"));
  const file = join(root, "src/Button.stories.tsx");
  await writeFile(file, 'export default { title: "Button", tags: ["forms"] };\n');
  await chmod(file, 0o660);
  const initial = await getComponentTags(root, "./src/Button.stories.tsx");
  expect(initial.tags).toEqual(["forms"]);
  const result = await saveComponentTags(root, "./src/Button.stories.tsx", initial.revision, [
    "layout",
  ]);
  expect(result.tags).toEqual(["layout"]);
  await expect(
    saveComponentTags(root, "./src/Button.stories.tsx", initial.revision, ["wrong"]),
  ).rejects.toThrow(/changed/i);
  expect(await readFile(file, "utf8")).toContain('tags: ["layout"]');
  expect((await lstat(file)).mode & 0o777).toBe(0o660);
});

test("rejects paths outside the project, non-story files and symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "governator-tag-root-"));
  const other = await mkdtemp(join(tmpdir(), "governator-tag-other-"));
  await writeFile(join(other, "Button.stories.tsx"), 'export default {title: "Button"};');
  await symlink(other, join(root, "linked"));
  await expect(getComponentTags(root, "../outside.stories.tsx")).rejects.toThrow();
  await expect(getComponentTags(root, "./package.json")).rejects.toThrow();
  await expect(getComponentTags(root, "./linked/Button.stories.tsx")).rejects.toThrow();
});

test("concurrent saves from the same revision do not overwrite each other", async () => {
  const root = await mkdtemp(join(tmpdir(), "governator-tag-race-"));
  await writeFile(
    join(root, "Button.stories.tsx"),
    'export default { title: "Button", tags: ["forms"] };\n',
  );
  const initial = await getComponentTags(root, "./Button.stories.tsx");
  const results = await Promise.allSettled([
    saveComponentTags(root, "./Button.stories.tsx", initial.revision, ["one"]),
    saveComponentTags(root, "./Button.stories.tsx", initial.revision, ["two"]),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
});
