/* oxlint-disable linteffect/no-return-in-arrow, linteffect/no-try-catch */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withJournalLock } from "../scripts/release-journal.ts";
import { expect, test } from "vitest";
import { createCandidate, candidateDigest } from "../packages/cli/src/first-release-rehearsal.ts";
import { runDurableRelease } from "../scripts/durable-release.ts";

const commit = "a".repeat(40);
const archives = [
  { name: "@opsydyn/governator-cli", version: "0.1.0", bytes: Uint8Array.from([1]) },
  { name: "@opsydyn/governator-mcp", version: "0.1.0", bytes: Uint8Array.from([2]) },
  { name: "@opsydyn/storybook-addon-governator", version: "0.1.0", bytes: Uint8Array.from([3]) },
];
const candidate = createCandidate(commit, archives);
const identity = {
  candidate,
  digest: candidateDigest(candidate),
  sourceCommit: commit,
  artifactId: "123",
};

test("persists unknown before upload, then recovers by registry readback", async () => {
  const stored = new Map<string, Uint8Array>();
  let journal: any;
  let interrupted = true;
  const store = {
    async load() {
      return journal;
    },
    async save(value: any) {
      journal = structuredClone(value);
    },
  };
  const port = {
    async read(name: string) {
      const bytes = stored.get(name);
      return bytes ? { status: "present" as const, bytes } : { status: "absent" as const };
    },
    async send(name: string, _version: string, bytes: Uint8Array) {
      expect(journal.packages.find((p: any) => p.name === name).status).toBe("unknown");
      stored.set(name, bytes);
      if (interrupted) {
        interrupted = false;
        throw Error("lost acknowledgement");
      }
    },
  };
  const first = await runDurableRelease(identity, archives, store, port);
  expect(first.status).toBe("stopped");
  expect(journal.packages[0].status).toBe("unknown");
  const retry = await runDurableRelease(identity, archives, store, port);
  expect(retry.status).toBe("complete");
  expect(journal.packages.every((p: any) => p.status === "verified")).toBe(true);
});

test("does not retry an uncertain upload when readback is absent", async () => {
  let journal: any;
  let sends = 0;
  const store = {
    async load() {
      return journal;
    },
    async save(value: any) {
      journal = structuredClone(value);
    },
  };
  const port = {
    async read() {
      return { status: "absent" as const };
    },
    async send() {
      sends++;
      throw Error("unknown");
    },
  };
  await runDurableRelease(identity, archives, store, port);
  const retry = await runDurableRelease(identity, archives, store, port);
  expect(retry.status).toBe("stopped");
  expect(sends).toBe(1);
});

test("journal persists between sessions and refuses concurrent writers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "governator-journal-test-"));
  try {
    await withJournalLock(dir, async (store) => {
      expect(await store.load()).toBeUndefined();
      await store.save({
        schemaVersion: 1,
        sourceCommit: commit,
        candidateDigest: identity.digest,
        artifactId: "123",
        packages: archives.map((p) => ({ name: p.name, status: "not_attempted" })),
      });
      await expect(withJournalLock(dir, async () => {})).rejects.toThrow();
    });
    await withJournalJournalRead();
    async function withJournalJournalRead() {
      await withJournalLock(dir, async (store) =>
        expect(((await store.load()) as any).candidateDigest).toBe(identity.digest),
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a conflict remains blocked across retries and never sends", async () => {
  let journal: any;
  let sends = 0;
  let conflict = true;
  const store = {
    async load() {
      return journal;
    },
    async save(value: any) {
      journal = structuredClone(value);
    },
  };
  const port = {
    async read() {
      return { status: "present" as const, bytes: Uint8Array.from([conflict ? 99 : 1]) };
    },
    async send() {
      sends++;
    },
  };
  await runDurableRelease(identity, archives, store, port);
  expect(journal.packages[0].status).toBe("conflict");
  conflict = false;
  expect((await runDurableRelease(identity, archives, store, port)).status).toBe("stopped");
  expect(sends).toBe(0);
  expect(journal.packages[0].status).toBe("conflict");
});

test("invalid registry responses do not change the journal", async () => {
  let journal: any;
  const store = {
    async load() {
      return journal;
    },
    async save(value: any) {
      journal = structuredClone(value);
    },
  };
  const port = {
    async read() {
      return { status: "present" as const, bytes: Uint8Array.from([99]), extra: true };
    },
    async send() {},
  };
  expect((await runDurableRelease(identity, archives, store, port)).status).toBe("stopped");
  expect(journal.packages[0].status).toBe("not_attempted");
});

test("journal handles cannot be used after the lock is released", async () => {
  const dir = await mkdtemp(join(tmpdir(), "governator-journal-closed-"));
  let held: any;
  try {
    await withJournalLock(dir, async (store) => {
      held = store;
    });
    await expect(held.load()).rejects.toThrow(/closed/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("unawaited journal writes finish before another owner can acquire the lock", async () => {
  const dir = await mkdtemp(join(tmpdir(), "governator-journal-drain-"));
  try {
    await withJournalLock(dir, async (store) => {
      void store.save({
        schemaVersion: 1,
        sourceCommit: commit,
        candidateDigest: identity.digest,
        artifactId: "123",
        packages: archives.map((p) => ({ name: p.name, status: "unknown" })),
      });
    });
    await withJournalLock(dir, async (store) => {
      expect(((await store.load()) as any).packages[0].status).toBe("unknown");
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("unawaited failed journal writes fail the locked operation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "governator-journal-fail-"));
  try {
    await mkdir(join(dir, "journal.json"));
    await expect(
      withJournalLock(dir, async (store) => {
        void store.save({
          schemaVersion: 1,
          sourceCommit: commit,
          candidateDigest: identity.digest,
          artifactId: "123",
          packages: [],
        });
      }),
    ).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("never sends if saving the uncertain state fails", async () => {
  let writes = 0;
  let sends = 0;
  const store = {
    async load() {
      return undefined;
    },
    async save() {
      writes++;
      if (writes > 1) throw Error("disk full");
    },
  };
  const port = {
    async read() {
      return { status: "absent" as const };
    },
    async send() {
      sends++;
    },
  };
  const result = await runDurableRelease(identity, archives, store, port);
  expect(result.status).toBe("stopped");
  expect(sends).toBe(0);
});

test("rejects a journal bound to a different artifact before registry operations", async () => {
  let reads = 0;
  const store = {
    async load() {
      return {
        schemaVersion: 1,
        sourceCommit: commit,
        candidateDigest: identity.digest,
        artifactId: "999",
        packages: [],
      };
    },
    async save() {},
  };
  const port = {
    async read() {
      reads++;
      return { status: "absent" as const };
    },
    async send() {},
  };
  await expect(runDurableRelease(identity, archives, store, port)).rejects.toThrow(/identity/i);
  expect(reads).toBe(0);
});

test("journal snapshots submitted data before a caller can mutate it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "governator-journal-copy-"));
  try {
    await withJournalLock(dir, async (store) => {
      const journal = {
        schemaVersion: 1 as const,
        sourceCommit: commit,
        candidateDigest: identity.digest,
        artifactId: "123",
        packages: archives.map((p) => ({ name: p.name, status: "unknown" as const })),
      };
      const pending = store.save(journal);
      journal.packages[0]!.name = "changed";
      await pending;
      expect(((await store.load()) as any).packages[0].name).toBe(archives[0]!.name);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a disk journal recovers an interrupted upload across separate lock sessions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "governator-release-restart-"));
  const stored = new Map<string, Uint8Array>();
  let sends = 0;
  const port = {
    async read(name: string) {
      const bytes = stored.get(name);
      return bytes ? { status: "present" as const, bytes } : { status: "absent" as const };
    },
    async send(name: string, _version: string, bytes: Uint8Array) {
      stored.set(name, bytes);
      sends++;
      if (sends === 1) throw Error("acknowledgement lost");
    },
  };
  try {
    const first = await withJournalLock(dir, (store) =>
      runDurableRelease(identity, archives, store, port),
    );
    expect(first.status).toBe("stopped");
    const second = await withJournalLock(dir, (store) =>
      runDurableRelease(identity, archives, store, port),
    );
    expect(second.status).toBe("complete");
    expect(sends).toBe(3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects an oversized artifact identity before writing or contacting a registry", async () => {
  let touched = false;
  const store = {
    async load() {
      touched = true;
      return undefined;
    },
    async save() {},
  };
  const port = {
    async read() {
      touched = true;
      return { status: "absent" as const };
    },
    async send() {},
  };
  await expect(
    runDurableRelease({ ...identity, artifactId: "1".repeat(70000) }, archives, store, port),
  ).rejects.toThrow(/artifact/i);
  expect(touched).toBe(false);
});
