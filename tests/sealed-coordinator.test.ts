/* oxlint-disable linteffect/no-return-in-arrow */
import { expect, test } from "vitest";
import { candidateDigest, createCandidate } from "../packages/cli/src/first-release-rehearsal.ts";
import { exerciseSealedCoordinator } from "../scripts/qualify-sealed-coordinator.ts";
import type { RegistryPort } from "../packages/cli/src/single-maintainer-adapter.ts";

const commit = "a".repeat(40);
const archives = [
  { name: "@opsydyn/governator-cli", version: "0.1.0", bytes: Uint8Array.from([1]) },
  { name: "@opsydyn/governator-mcp", version: "0.1.0", bytes: Uint8Array.from([2]) },
  { name: "@opsydyn/storybook-addon-governator", version: "0.1.0", bytes: Uint8Array.from([3]) },
];
const candidate = createCandidate(commit, archives);

test("recovers a lost upload acknowledgement by reading back bytes before retry", async () => {
  const store = new Map<string, Uint8Array>();
  const sends: string[] = [];
  const port: RegistryPort = {
    async read(name) {
      const bytes = store.get(name);
      return bytes ? { status: "present", bytes } : { status: "absent" };
    },
    async send(name, _version, bytes) {
      sends.push(name);
      store.set(name, Uint8Array.from(bytes));
    },
  };
  const result = await exerciseSealedCoordinator(
    candidate,
    candidateDigest(candidate),
    commit,
    archives,
    port,
  );
  expect(result.interrupted.packages.map((p) => p.status)).toEqual([
    "verified",
    "unknown",
    "not_attempted",
  ]);
  expect(result.retry.packages.map((p) => p.status)).toEqual([
    "already_verified",
    "already_verified",
    "verified",
  ]);
  expect(sends).toEqual(archives.map((p) => p.name));
  expect(result.conflict.packages.map((p) => p.status)).toEqual([
    "already_verified",
    "already_verified",
    "conflict",
  ]);
});

test("stops when readback disagrees with the uploaded archive", async () => {
  const port: RegistryPort = {
    async read() {
      return { status: "present", bytes: Uint8Array.from([99]) };
    },
    async send() {
      throw new Error("must not send");
    },
  };
  await expect(
    exerciseSealedCoordinator(candidate, candidateDigest(candidate), commit, archives, port),
  ).rejects.toThrow();
});
