import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { checkDocsLinks } from "../scripts/check-docs-links.ts";

const fixtures: string[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function site(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "docs-links-"));
  fixtures.push(root);
  for (const [path, html] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), html);
  }
  return root;
}
test("validates routes, index aliases, decoded fragments and relative links without executing scripts", async () => {
  const root = await site({
    "index.html":
      '<a href="/guide">Guide</a><a href="/guide/">Guide</a><a href="/guide/index.html#caf%C3%A9">Anchor</a><a href="https://example.com/missing">Remote</a><a href="mailto:a@example.com">Mail</a><script>throw new Error("must not execute")</script>',
    "guide/index.html":
      '<h1 id="café">Guide</h1><a href="../#home">Home</a><a href="./next?mode=1#target">Next</a>',
    "guide/next/index.html": '<div id="target"></div>',
  });
  await writeFile(
    join(root, "index.html"),
    `${await Bun.file(join(root, "index.html")).text()}<div id="home"></div>`,
  );
  expect(await checkDocsLinks(root)).toEqual([]);
});
test("reports missing local pages and fragments", async () => {
  const root = await site({
    "index.html": '<a href="/missing/">Missing</a><a href="/guide/#absent">Fragment</a>',
    "guide/index.html": '<h1 id="present">Guide</h1>',
  });
  const issues = await checkDocsLinks(root);
  expect(issues).toHaveLength(2);
  expect(issues.join("\n")).toContain("missing page");
  expect(issues.join("\n")).toContain("missing fragment");
});
test("rejects malformed encoding and paths escaping the output root", async () => {
  const root = await site({
    "index.html":
      '<a href="../../secret">Escape</a><a href="/%2e%2e/secret">Encoded escape</a><a href="/bad%ZZ">Malformed</a><a href="/a%2fb">Encoded separator</a>',
  });
  expect(await checkDocsLinks(root)).toHaveLength(4);
});

test("reports broken relative targets from nested pages", async () => {
  const root = await site({
    "index.html": "<h1>Home</h1>",
    "guide/index.html":
      '<a href="../missing/">Missing sibling</a><a href="./#absent">Missing local anchor</a>',
  });
  const issues = await checkDocsLinks(root);
  expect(issues).toHaveLength(2);
  expect(issues.every((issue) => issue.startsWith("guide/index.html:"))).toBe(true);
});
