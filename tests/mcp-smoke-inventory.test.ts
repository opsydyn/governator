import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { gitIndexDigest } from "../scripts/mcp-smoke-inventory.ts";
import { bytesDigest } from "../packages/query/src/archive.ts";

function fixtureGit(root: string, args: string[]): string {
  const child = Bun.spawnSync(["git", "-c", "core.hooksPath=/dev/null", "-C", root, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  return child.stdout.toString().trim();
}

test("smoke inventory hashes the complete independent index of ordinary and linked checkouts", async () => {
  const root = await mkdtemp(join(tmpdir(), "governator-index-audit-"));
  await (async () => {
    const main = `${root}/main`,
      worktree = `${root}/linked`;
    await mkdir(main);
    fixtureGit(main, ["init", "-q"]);
    await writeFile(`${main}/tracked.txt`, "original\n");
    fixtureGit(main, ["add", "."]);
    fixtureGit(main, [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture",
    ]);
    fixtureGit(main, ["worktree", "add", "--detach", worktree, "HEAD"]);
    expect(await readFile(`${worktree}/.git`, "utf8")).toMatch(/^gitdir: /);
    const mainBefore = await gitIndexDigest(main);
    const linkedBefore = await gitIndexDigest(worktree);
    const actualIndex = fixtureGit(worktree, ["rev-parse", "--git-path", "index"]);
    expect(linkedBefore).toBe(bytesDigest(await readFile(actualIndex)));
    await writeFile(`${worktree}/tracked.txt`, "staged modification\n");
    fixtureGit(worktree, ["add", "tracked.txt"]);
    expect(await gitIndexDigest(worktree)).not.toBe(linkedBefore);
    expect(await gitIndexDigest(main)).toBe(mainBefore);
  })().finally(() => rm(root, { recursive: true, force: true }));
});
