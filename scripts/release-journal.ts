/* Local journal primitive. The caller must protect the directory and manage crash recovery. */
/* oxlint-disable linteffect/no-try-catch, linteffect/no-return-in-arrow, linteffect/no-if-statement, linteffect/no-process-env-direct-read, linteffect/no-string-sentinel-const, linteffect/no-boundary-try-catch-without-effect-map, linteffect/no-naked-object-state-update -- Filesystem locking, JSON and error handling at the journal boundary. */
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rmdir, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { ensure } from "@governator/core";
import type { JournalStore, ReleaseJournal } from "./durable-release.ts";

export async function withJournalLock<T>(
  directory: string,
  run: (store: JournalStore) => Promise<T>,
): Promise<T> {
  ensure(isAbsolute(directory), "Journal directory must be absolute");
  const meta = await lstat(directory);
  ensure(
    meta.isDirectory() &&
      !meta.isSymbolicLink() &&
      (meta.mode & 0o077) === 0 &&
      meta.uid === process.getuid?.(),
    "Journal directory must be private and owned by the operator",
  );
  const lock = join(directory, "journal.lock");
  await mkdir(lock, { mode: 0o700 });
  const path = join(directory, "journal.json");
  async function syncDirectory() {
    const dir = await open(directory, constants.O_RDONLY);
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  }
  const rawStore: JournalStore = {
    async load() {
      let handle;
      try {
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
      try {
        const stat = await handle.stat();
        ensure(stat.isFile() && stat.size > 0 && stat.size <= 65536, "Invalid journal file");
        return JSON.parse(await handle.readFile("utf8"));
      } finally {
        await handle.close();
      }
    },
    async save(value: ReleaseJournal) {
      const encoded = JSON.stringify(value) + "\n";
      ensure(Buffer.byteLength(encoded) <= 65536, "Journal exceeds size limit");
      const temporary = join(directory, `.journal-${randomUUID()}.tmp`);
      const handle = await open(temporary, "wx", 0o600);
      try {
        try {
          await handle.writeFile(encoded);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporary, path);
        await syncDirectory();
      } finally {
        await unlink(temporary).catch(() => {});
      }
    },
  };
  let closed = false;
  const active = new Set<Promise<unknown>>();
  let tail: Promise<void> = Promise.resolve();
  let failure: unknown;
  function tracked<R>(fn: () => Promise<R>): Promise<R> {
    if (closed) return Promise.reject(new Error("Journal store is closed"));
    const promise = tail.then(() => {
      if (failure !== undefined) throw new Error("Journal queue stopped after a failure");
      return fn();
    });
    tail = promise.then(
      () => {},
      () => {},
    );
    active.add(promise);
    void promise.then(
      () => active.delete(promise),
      (error) => {
        failure = error;
        active.delete(promise);
      },
    );
    return promise;
  }
  const store: JournalStore = {
    load: () => tracked(() => rawStore.load()),
    save: (value) => {
      const snapshot = structuredClone(value);
      return tracked(() => rawStore.save(snapshot));
    },
  };
  let result: T | undefined;
  let callbackError: unknown;
  let callbackFailed = false;
  try {
    await syncDirectory();
    result = await run(store);
  } catch (error) {
    callbackFailed = true;
    callbackError = error;
  } finally {
    closed = true;
    await Promise.allSettled(active);
    await rmdir(lock);
    await syncDirectory();
  }
  if (callbackFailed) throw callbackError;
  if (failure !== undefined) throw failure;
  return result as T;
}
