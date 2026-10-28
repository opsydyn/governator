import { afterEach, expect, test } from "vitest";
import { writeFile, symlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { captureCandidate, checkCandidate } from "../packages/cli/src/release.ts";
import { runCli } from "../packages/cli/src/index.ts";
import { releaseProject, review } from "./release-fixtures.ts";
const roots: string[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}
async function project(fails = false) {
  const root = await releaseProject(fails);
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const capture = (root: string) =>
  runCli([
    "release",
    "candidate",
    "--root",
    root,
    "--config",
    "governance/release.json",
    "--out",
    "artifacts/candidate",
  ]);
const check = (root: string, demo = true) =>
  runCli([
    "release",
    "check",
    "--root",
    root,
    "--config",
    "governance/release.json",
    "--candidate",
    "artifacts/candidate/candidate.json",
    ...(demo ? ["--demo"] : []),
  ]);
test("captures a real tarball, rechecks builds/tests and permits only explicitly simulated review", async () => {
  const root = await project();
  await writeFile(join(root, "dist/stale-output.js"), "export const stale = true;");
  const captured = await capture(root);
  expect(captured.code, captured.stderr).toBe(0);
  expect(
    JSON.parse(captured.stdout).candidate.artifact.files["dist/stale-output.js"],
  ).toBeUndefined();
  await review(root);
  expect(await check(root)).toMatchObject({ code: 0 });
  const output = JSON.parse((await check(root)).stdout);
  expect(output).toMatchObject({
    consumerChecks: {
      result: "passed",
      fixtures: ["governance/consumer.ts"],
      diagnostics: [],
      compilerVersion: "5.9.3",
      artifactDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    },
    gate: "ready",
    assurance: "simulated",
    publishable: false,
    publication: "unknown",
    deployment: "unknown",
  });
  expect((await check(root, false)).code).toBe(1);
  const manifest = await Bun.file(join(root, "artifacts/candidate/candidate.json")).json();
  await writeFile(join(root, "artifacts/candidate", manifest.tarball), "changed artifact");
  expect(await check(root)).toMatchObject({
    code: 2,
    stderr: expect.stringMatching(/digest|artifact|archive/i),
  });
}, 30000);
test("fails closed on dirty/changed inputs, untracked config, unsafe output and actual failing tests", async () => {
  const root = await project();
  expect((await capture(root)).code).toBe(0);
  await review(root);
  await writeFile(join(root, ".changeset/ui.md"), "changed intent");
  expect((await check(root)).code).toBe(2);
  git(root, "checkout", "--", ".changeset/ui.md");
  expect(
    (
      await runCli([
        "release",
        "candidate",
        "--root",
        root,
        "--config",
        "governance/release.json",
        "--out",
        "../escape",
      ])
    ).code,
  ).toBe(2);
  await symlink("/private/tmp", join(root, "artifacts/linked"));
  expect(
    (
      await runCli([
        "release",
        "candidate",
        "--root",
        root,
        "--config",
        "governance/release.json",
        "--out",
        "artifacts/linked",
      ])
    ).code,
  ).toBe(2);
  const failed = await project(true);
  expect((await capture(failed)).code).toBe(0);
  await review(failed);
  expect((await check(failed)).code).toBe(1);
}, 30000);

test("direct candidate APIs canonicalize a symlinked repository root", async () => {
  const root = await project(),
    alias = root + "-alias";
  await symlink(root, alias);
  roots.push(alias);
  const captured = await captureCandidate(alias, "governance/release.json", "artifacts/candidate");
  await review(root);
  const checked = await checkCandidate(alias, "governance/release.json", captured.path, true);
  expect(checked.gate).toBe("ready");
}, 30000);

test("rejects an unlisted tracked Changeset", async () => {
  const root = await project();
  await writeFile(
    join(root, ".changeset/unlisted.md"),
    '---\n"@test/ui": patch\n---\nAdditional release intent.\n',
  );
  git(root, "add", ".changeset/unlisted.md");
  git(
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "Add unlisted intent",
  );
  const result = await capture(root);
  expect(result.code).toBe(2);
  expect(result.stderr).toMatch(/enumerate every pending/);
}, 30000);
