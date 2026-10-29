import { afterEach, expect, test } from "vitest";
import { mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const source = resolve(import.meta.dirname, "..");
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("release demo isolates its simulated changeset from a real pending changeset", async () => {
  const root = await mkdtemp(join(tmpdir(), "governator-demo-source-"));
  const run = (args: string[], cwd = root) =>
    Bun.spawnSync(args, { cwd, stdout: "pipe", stderr: "pipe", timeout: 120_000 });
  roots.push(root);
  expect(run(["git", "clone", "--quiet", "--no-hardlinks", source, root], source).exitCode).toBe(0);
  await symlink(join(source, "node_modules"), join(root, "node_modules"));
  for (const name of await readdir(join(source, "packages"))) {
    const modules = join(source, "packages", name, "node_modules");
    if (await Bun.file(join(modules, ".bin", "tsdown")).exists())
      await symlink(modules, join(root, "packages", name, "node_modules"));
    else if (await Bun.file(join(modules, "effect", "package.json")).exists())
      await symlink(modules, join(root, "packages", name, "node_modules"));
  }
  await writeFile(
    join(root, ".changeset/real-change.md"),
    '---\n"@opsydyn/governator-cli": patch\n---\nA real future release.\n',
  );
  const configPath = join(root, "governance/release.json");
  const config = await Bun.file(configPath).json();
  config.changesets.push(".changeset/real-change.md");
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  expect(run(["git", "add", ".changeset/real-change.md", "governance/release.json"]).exitCode).toBe(
    0,
  );
  expect(
    run([
      "git",
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "Pending change",
    ]).exitCode,
  ).toBe(0);
  const demo = run([process.execPath, "scripts/release-demo.ts"]);
  expect(demo.exitCode, demo.stderr.toString()).toBe(0);
  const result = JSON.parse(demo.stdout.toString());
  expect(result.results.patch.gate).toBe("blocked");
  expect(result.results.patch.reasons).toContain(
    "Changeset requires at least major; declared patch",
  );
  expect(result.results.major.status).toBe("eligible_under_demo_policy");
  expect(await Bun.file(join(root, ".changeset/real-change.md")).exists()).toBe(true);
}, 120_000);
