/* oxlint-disable linteffect/no-try-catch */
import { expect, test } from "vitest";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateArtifactMetadata,
  validateQualificationRun,
  verifyArtifactDigest,
  validateDecodedNames,
  verifyToolDigest,
  hashNpmTree,
  containsPublisherUid,
  canTraverseUnprivileged,
  runSealedPublisher,
} from "../scripts/sealed-publisher.ts";

test("refuses production publishing until recovery and isolation are qualified", async () => {
  await expect(
    runSealedPublisher(
      {} as Parameters<typeof runSealedPublisher>[0],
      {} as Parameters<typeof runSealedPublisher>[1],
    ),
  ).rejects.toThrow(/authoritative checkpoint recovery and runner isolation/);
});

const expected = {
  artifactId: "123",
  runId: "456",
  runAttempt: "1",
  sourceCommit: "a".repeat(40),
  repositoryId: "789",
  kind: "candidate" as const,
};
const metadata = {
  id: 123,
  name: "governator-candidate-456-1",
  expired: false,
  digest: "sha256:" + "b".repeat(64),
  workflow_run: {
    id: 456,
    head_branch: "main",
    head_sha: "a".repeat(40),
    repository_id: 789,
    head_repository_id: 789,
  },
};
test("binds an unexpired artifact to the expected run, repository and source", () => {
  expect(() => validateArtifactMetadata(metadata, expected)).not.toThrow();
  for (const altered of [
    { ...metadata, expired: true },
    { ...metadata, id: 124 },
    { ...metadata, name: "other" },
    { ...metadata, workflow_run: { ...metadata.workflow_run, head_sha: "b".repeat(40) } },
  ])
    expect(() => validateArtifactMetadata(altered, expected)).toThrow();
});

test("requires the exact successful non-publishing qualification run", () => {
  const run = {
    id: 456,
    run_attempt: 1,
    path: ".github/workflows/release-qualification.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "a".repeat(40),
    status: "completed",
    conclusion: "success",
    repository: { id: 789 },
    head_repository: { id: 789 },
  };
  expect(() => validateQualificationRun(run, expected)).not.toThrow();
  expect(() => validateQualificationRun({ ...run, conclusion: "failure" }, expected)).toThrow();
  expect(() =>
    validateQualificationRun({ ...run, path: ".github/workflows/release.yml" }, expected),
  ).toThrow();
});

test("artifact ZIP bytes must match the GitHub metadata digest", () => {
  const bytes = Uint8Array.from([1, 2, 3]);
  const digest = "sha256:" + new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  expect(() => verifyArtifactDigest(bytes, digest)).not.toThrow();
  expect(() => verifyArtifactDigest(Uint8Array.from([1, 2, 4]), digest)).toThrow();
});

test("refuses unexpected decoded artifact names before filesystem writes", () => {
  expect(() => validateDecodedNames("attestation", ["attestation.jsonl"])).not.toThrow();
  expect(() => validateDecodedNames("attestation", ["../escape"])).toThrow();
  expect(() => validateDecodedNames("attestation", ["attestation.jsonl", "extra"])).toThrow();
});

test("tool bytes must match an explicitly selected digest", () => {
  const bytes = Uint8Array.from([5, 6]);
  const digest = "sha256:" + new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  expect(() => verifyToolDigest(bytes, digest)).not.toThrow();
  expect(() => verifyToolDigest(bytes, "sha256:" + "0".repeat(64))).toThrow();
});

test("npm tree digest changes with file content and rejects symlinks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "npm-tree-"));
  try {
    await writeFile(join(dir, "cli.js"), "first");
    const initial = await hashNpmTree(dir);
    expect(await hashNpmTree(dir)).toBe(initial);
    await writeFile(join(dir, "cli.js"), "second");
    expect(await hashNpmTree(dir)).not.toBe(initial);
    await symlink("/tmp", join(dir, "link"));
    await expect(hashNpmTree(dir)).rejects.toThrow(/untrusted/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("detects any process using the isolated publishing UID", () => {
  expect(containsPublisherUid("Name:\tnode\nUid:\t1000\t65534\t1000\t1000\n")).toBe(true);
  expect(containsPublisherUid("Name:\tinit\nUid:\t0\t0\t0\t0\n")).toBe(false);
  expect(() => containsPublisherUid("malformed")).toThrow();
});

test("staging directories must be traversable by the unprivileged verifier", () => {
  expect(canTraverseUnprivileged(0o711)).toBe(true);
  expect(canTraverseUnprivileged(0o700)).toBe(false);
});
