/* oxlint-disable linteffect/no-return-in-arrow -- Test doubles implement imperative IO interfaces. */
import { expect, test } from "vitest";
import { createCandidate, candidateDigest } from "../packages/cli/src/first-release-rehearsal.ts";
import { runDurableRelease } from "../scripts/durable-release.ts";
import { checkpointedJournal } from "../scripts/checkpoint-journal.ts";
import type { ReleaseJournal } from "../scripts/durable-release.ts";

const journal: ReleaseJournal = {
  schemaVersion: 1,
  sourceCommit: "a".repeat(40),
  candidateDigest: "b".repeat(64),
  artifactId: "123",
  packages: [{ name: "@opsydyn/governator-cli", status: "unknown" }],
};

test("does not acknowledge a checkpoint until immutable readback matches", async () => {
  let local: unknown;
  const localStore = {
    async load() {
      return local;
    },
    async save(value: ReleaseJournal) {
      local = structuredClone(value);
    },
  };
  const remote = {
    async append(_bytes: Uint8Array) {
      return "1234";
    },
    async read(_id: string) {
      return Uint8Array.from([9]);
    },
  };
  const store = checkpointedJournal(localStore, remote);
  await expect(store.save(journal)).rejects.toThrow(/readback/i);
  expect(local).toEqual(journal);
  await expect(store.save(journal)).rejects.toThrow(/reconciliation/i);
  expect(() => store.load()).toThrow(/reconciliation/i);
});

test("preserves a matching immutable checkpoint before acknowledging save", async () => {
  let local: unknown;
  let retained = new Uint8Array();
  const localStore = {
    async load() {
      return local;
    },
    async save(value: ReleaseJournal) {
      local = structuredClone(value);
    },
  };
  const remote = {
    async append(bytes: Uint8Array) {
      retained = Uint8Array.from(bytes);
      return "1234";
    },
    async read(_id: string) {
      return retained;
    },
  };
  const store = checkpointedJournal(localStore, remote);
  await store.save(journal);
  expect(JSON.parse(new TextDecoder().decode(retained))).toEqual(journal);
});

test("release sends nothing when the remote unknown-state checkpoint cannot be verified", async () => {
  const commit = "a".repeat(40);
  const archives = ["governator-cli", "governator-mcp", "storybook-addon-governator"].map(
    (name, i) => ({ name: `@opsydyn/${name}`, version: "0.1.0", bytes: Uint8Array.from([i + 1]) }),
  );
  const candidate = createCandidate(commit, archives);
  let local: unknown;
  let calls = 0;
  const localStore = {
    async load() {
      return local;
    },
    async save(value: ReleaseJournal) {
      local = structuredClone(value);
    },
  };
  const remote = {
    async append(_bytes: Uint8Array) {
      calls++;
      return "1234";
    },
    async read(_id: string) {
      return calls === 1
        ? new TextEncoder().encode(JSON.stringify(local) + "\n")
        : Uint8Array.from([9]);
    },
  };
  let sends = 0;
  const registry = {
    async read() {
      return { status: "absent" as const };
    },
    async send() {
      sends++;
    },
  };
  const result = await runDurableRelease(
    { candidate, digest: candidateDigest(candidate), sourceCommit: commit, artifactId: "123" },
    archives,
    checkpointedJournal(localStore, remote),
    registry,
  );
  expect(result.status).toBe("stopped");
  expect(sends).toBe(0);
});
