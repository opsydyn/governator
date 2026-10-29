import { gzipSync } from "node:zlib";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as tar from "tar";
import {
  assertEmptyFirstReleaseQueue,
  inspectArchiveForRehearsal,
} from "../scripts/rehearse-single-maintainer";
import { describe, expect, it } from "vitest";
import {
  createCandidate,
  verifyNpmFixtureUpload,
  rehearseCandidate,
  candidateDigest,
} from "../packages/cli/src/first-release-rehearsal";

const commit = "a".repeat(40);
const archives = [
  { name: "@opsydyn/governator-cli", version: "0.1.0", bytes: new Uint8Array([1, 2]) },
  { name: "@opsydyn/governator-mcp", version: "0.1.0", bytes: new Uint8Array([3, 4]) },
  { name: "@opsydyn/storybook-addon-governator", version: "0.1.0", bytes: new Uint8Array([5, 6]) },
];

describe("single-maintainer offline rehearsal", () => {
  it("binds the exact commit and package bytes to a reviewed candidate", async () => {
    const candidate = createCandidate(commit, archives);
    const result = await rehearseCandidate(candidate, candidateDigest(candidate), commit, archives);
    expect(result.mode).toBe("offline-rehearsal");
    expect(result.publishable).toBe(false);
    expect(result.reviewedDigest).toBe(candidateDigest(candidate));
    expect(result.sourceCommit).toBe(commit);
    expect(result.receipts).toHaveLength(3);
    expect(result.receipts.map((receipt) => receipt.sha256)).toEqual(
      candidate.packages.map((entry) => entry.sha256),
    );
  });
  it("rejects wrong review digest, changed source, or changed bytes before any fake transfer", async () => {
    const candidate = createCandidate(commit, archives);
    await expect(rehearseCandidate(candidate, "0".repeat(64), commit, archives)).rejects.toThrow();
    await expect(
      rehearseCandidate(candidate, candidateDigest(candidate), "b".repeat(40), archives),
    ).rejects.toThrow();
    const changed = archives.map((item, index) =>
      index === 1 ? { ...item, bytes: new Uint8Array([9]) } : item,
    );
    await expect(
      rehearseCandidate(candidate, candidateDigest(candidate), commit, changed),
    ).rejects.toThrow();
  });
  it("rejects missing, duplicate, extra and wrong-version packages", () => {
    expect(() => createCandidate(commit, archives.slice(1))).toThrow();
    expect(() => createCandidate(commit, [...archives, archives[0]!])).toThrow();
    expect(() =>
      createCandidate(commit, [
        ...archives,
        { name: "@governator/extra", version: "0.1.0", bytes: new Uint8Array([1]) },
      ]),
    ).toThrow();
    expect(() =>
      createCandidate(
        commit,
        archives.map((item) => ({ ...item, version: "0.2.0" })),
      ),
    ).toThrow();
  });
  it("copies and validates all bytes before fake transfer, resisting later mutation of input paths", async () => {
    const mutable = archives.map((item) => ({ ...item, bytes: Uint8Array.from(item.bytes) }));
    const candidate = createCandidate(commit, mutable);
    const result = await rehearseCandidate(
      candidate,
      candidateDigest(candidate),
      commit,
      mutable,
      () => {
        mutable[1]!.bytes[0] = 99;
      },
    );
    expect(result.receipts.map((receipt) => receipt.sha256)).toEqual(
      candidate.packages.map((entry) => entry.sha256),
    );
  });
});

it("checks identity and required files inside the actual npm archive", async () => {
  const dir = await mkdtemp(join(tmpdir(), "governator-inspect-"));
  await mkdir(join(dir, "package"));
  await writeFile(
    join(dir, "package/package.json"),
    JSON.stringify({ name: "@opsydyn/governator-cli", version: "0.1.0" }),
  );
  for (const file of ["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"])
    await writeFile(join(dir, "package", file), file);
  const path = join(dir, "candidate.tgz");
  await tar.c({ cwd: dir, gzip: true, file: path }, ["package"]);
  const bytes = await readFile(path);
  await expect(
    inspectArchiveForRehearsal(bytes, "@opsydyn/governator-cli"),
  ).resolves.toBeUndefined();
  await expect(inspectArchiveForRehearsal(bytes, "@opsydyn/governator-mcp")).rejects.toThrow(
    /identity/,
  );
});

it("rejects plain tar and silently ignored tar entries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "governator-unsafe-tar-"));
  await mkdir(join(dir, "package"));
  await writeFile(
    join(dir, "package/package.json"),
    JSON.stringify({ name: "@opsydyn/governator-cli", version: "0.1.0" }),
  );
  for (const file of ["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "EXTRA"])
    await writeFile(join(dir, "package", file), file);
  const path = join(dir, "archive.tar");
  await tar.c({ cwd: dir, file: path }, ["package"]);
  const plain = await readFile(path);
  await expect(inspectArchiveForRehearsal(plain, "@opsydyn/governator-cli")).rejects.toThrow(
    /gzip/,
  );
  const changed = Buffer.from(plain);
  let found = false;
  for (let i = 0; i + 512 <= changed.length; i += 512) {
    const name = changed
      .subarray(i, i + 100)
      .toString()
      .split("\0")[0];
    if (name !== "package/EXTRA") continue;
    changed[i + 156] = "Z".charCodeAt(0);
    changed.fill(32, i + 148, i + 156);
    const sum = changed.subarray(i, i + 512).reduce((a, b) => a + b, 0);
    changed.write(sum.toString(8).padStart(6, "0") + "\0 ", i + 148, 8, "ascii");
    found = true;
    break;
  }
  expect(found).toBe(true);
  await expect(
    inspectArchiveForRehearsal(gzipSync(changed), "@opsydyn/governator-cli"),
  ).rejects.toThrow();
});

it("verifies the exact bytes received by the fake npm registry", async () => {
  const candidate = createCandidate(commit, archives);
  const expected = candidate.packages[0]!;
  const body = {
    name: expected.name,
    versions: { "0.1.0": { name: expected.name, version: expected.version } },
    _attachments: { "package.tgz": { data: Buffer.from(archives[0]!.bytes).toString("base64") } },
  };
  expect(verifyNpmFixtureUpload(expected, body).sha256).toBe(expected.sha256);
  expect(() =>
    verifyNpmFixtureUpload(expected, {
      ...body,
      _attachments: { "package.tgz": { data: "eA==" } },
    }),
  ).toThrow();
  expect(() =>
    verifyNpmFixtureUpload(expected, { ...body, name: "@opsydyn/governator-mcp" }),
  ).toThrow();
  expect(() =>
    verifyNpmFixtureUpload(expected, {
      ...body,
      versions: { "0.1.0": { name: "wrong", version: "0.1.0" } },
    }),
  ).toThrow();
});

it("rejects active Changesets before any first-release fixture", async () => {
  const dir = await mkdtemp(join(tmpdir(), "governator-intent-"));
  await mkdir(join(dir, ".changeset"));
  await writeFile(join(dir, ".changeset/README.md"), "notes");
  await expect(assertEmptyFirstReleaseQueue(dir)).resolves.toBeUndefined();
  await writeFile(join(dir, ".changeset/pending.md"), "---\n---\n");
  await expect(assertEmptyFirstReleaseQueue(dir)).rejects.toThrow(/Changesets/);
});
