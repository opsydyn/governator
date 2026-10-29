/* Unwired checkpoint adapter. A trusted immutable store and authoritative recovery selection are required. */
/* oxlint-disable linteffect/no-if-statement, linteffect/no-try-catch, linteffect/no-boundary-try-catch-without-effect-map, linteffect/no-naked-object-state-update, linteffect/no-string-sentinel-const -- Journal serialization and remote storage boundary. */
import { ensure } from "@governator/core";
import type { JournalStore, ReleaseJournal } from "./durable-release.ts";

export type CheckpointPort = {
  append(bytes: Uint8Array): Promise<string>;
  read(id: string): Promise<Uint8Array>;
};

/** A save is not acknowledged until the immutable checkpoint has been read back exactly. */
export function checkpointedJournal(local: JournalStore, remote: CheckpointPort): JournalStore {
  let busy = false;
  let failed = false;
  return {
    load: () => {
      ensure(!failed, "Checkpoint session requires reconciliation");
      return local.load();
    },
    async save(value: ReleaseJournal) {
      ensure(!failed, "Checkpoint session requires reconciliation");
      ensure(!busy, "Concurrent journal checkpoints are not permitted");
      busy = true;
      try {
        const snapshot = structuredClone(value);
        const bytes = new TextEncoder().encode(JSON.stringify(snapshot) + "\n");
        ensure(bytes.length > 0 && bytes.length <= 65536, "Invalid checkpoint size");
        await local.save(snapshot);
        const id = await remote.append(Uint8Array.from(bytes));
        ensure(/^[1-9][0-9]{0,19}$/.test(id), "Invalid checkpoint identity");
        const observed = await remote.read(id);
        ensure(
          observed instanceof Uint8Array &&
            observed.byteLength === bytes.byteLength &&
            Buffer.from(observed).equals(Buffer.from(bytes)),
          "Checkpoint readback mismatch",
        );
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        busy = false;
      }
    },
  };
}
