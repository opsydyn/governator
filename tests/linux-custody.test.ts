/* oxlint-disable linteffect/no-try-catch, linteffect/no-return-in-arrow */
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { candidateDigest, createCandidate } from "../packages/cli/src/first-release-rehearsal.ts";

const commit = "a".repeat(40);
const names = ["cli", "mcp", "storybook-addon"];
const archives = names.map((name, i) => ({
  name: `@governator/${name}`,
  version: "0.1.0",
  bytes: Uint8Array.from([i + 1, 2, 3]),
}));
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "governator-sealed-test-"));
  const candidate = createCandidate(commit, archives);
  writeFileSync(join(dir, "candidate.json"), JSON.stringify(candidate));
  for (const [index, archive] of archives.entries())
    writeFileSync(join(dir, `governator-${names[index]}-0.1.0.tgz`), archive.bytes);
  return { dir, digest: candidateDigest(candidate) };
}
function verify(dir: string, digest: string, source = commit) {
  return spawnSync(
    "python3",
    ["scripts/qualify-linux-custody.py", "validate", dir, digest, source],
    { encoding: "utf8" },
  );
}
describe("sealed custody candidate validation", () => {
  test("accepts exactly the selected candidate bytes and source", () => {
    const f = fixture();
    try {
      expect(verify(f.dir, f.digest).status).toBe(0);
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  });
  test("rejects changed bytes, unexpected files and wrong source before use", () => {
    const f = fixture();
    try {
      expect(verify(f.dir, f.digest, "b".repeat(40)).status).not.toBe(0);
      expect(verify(f.dir, "0".repeat(64)).status).not.toBe(0);
      writeFileSync(join(f.dir, "governator-cli-0.1.0.tgz"), "changed");
      expect(verify(f.dir, f.digest).status).not.toBe(0);
      writeFileSync(join(f.dir, "governator-cli-0.1.0.tgz"), archives[0]!.bytes);
      writeFileSync(join(f.dir, "extra.tgz"), "extra");
      expect(verify(f.dir, f.digest).status).not.toBe(0);
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  });
  test("rejects symlink archive inputs", () => {
    const f = fixture();
    try {
      const target = join(f.dir, "governator-cli-0.1.0.tgz");
      rmSync(target);
      symlinkSync("/dev/null", target);
      expect(verify(f.dir, f.digest).status).not.toBe(0);
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  });
});
