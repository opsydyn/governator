/* Unwired controller. A protected journal store and qualified registry port are required. */
/* oxlint-disable linteffect/no-return-in-arrow, linteffect/no-try-catch, linteffect/no-if-statement, linteffect/no-naked-object-state-update, linteffect/no-string-sentinel-const, linteffect/no-magic-domain-string */
import { ensure } from "@governator/core";
import { candidateDigest, createCandidate } from "../packages/cli/src/first-release-rehearsal.ts";
import type { Archive, Candidate } from "../packages/cli/src/first-release-rehearsal.ts";
import {
  decodeRegistryRead,
  rehearseSingleMaintainer,
} from "../packages/cli/src/single-maintainer-adapter.ts";
import type { RegistryPort } from "../packages/cli/src/single-maintainer-adapter.ts";

type Status = "not_attempted" | "unknown" | "verified" | "conflict";
export type ReleaseJournal = {
  schemaVersion: 1;
  sourceCommit: string;
  candidateDigest: string;
  artifactId: string;
  packages: Array<{ name: string; status: Status }>;
};
export type JournalStore = {
  load(): Promise<unknown>;
  save(value: ReleaseJournal): Promise<void>;
};
export async function runDurableRelease(
  identity: { candidate: unknown; digest: string; sourceCommit: string; artifactId: string },
  archives: readonly Archive[],
  store: JournalStore,
  port: RegistryPort,
) {
  ensure(/^[1-9][0-9]{0,19}$/.test(identity.artifactId), "Invalid artifact ID");
  ensure(candidateDigest(identity.candidate) === identity.digest, "Candidate digest mismatch");
  const snapshots = archives
    .map((a) => ({ ...a, bytes: Uint8Array.from(a.bytes) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const candidate: Candidate = createCandidate(identity.sourceCommit, snapshots);
  ensure(candidateDigest(candidate) === identity.digest, "Candidate bytes or source mismatch");
  const loaded = await store.load();
  let journal: ReleaseJournal;
  if (loaded === undefined) {
    journal = {
      schemaVersion: 1,
      sourceCommit: identity.sourceCommit,
      candidateDigest: identity.digest,
      artifactId: identity.artifactId,
      packages: candidate.packages.map((p) => ({ name: p.name, status: "not_attempted" })),
    };
    await store.save(journal);
  } else {
    ensure(typeof loaded === "object" && loaded !== null, "Invalid journal");
    const data = loaded as ReleaseJournal;
    ensure(
      data.schemaVersion === 1 &&
        data.sourceCommit === identity.sourceCommit &&
        data.candidateDigest === identity.digest &&
        data.artifactId === identity.artifactId &&
        Array.isArray(data.packages) &&
        data.packages.length === candidate.packages.length,
      "Journal identity mismatch",
    );
    ensure(
      data.packages.every(
        (p, i) =>
          p.name === candidate.packages[i]?.name &&
          ["not_attempted", "unknown", "verified", "conflict"].includes(p.status),
      ),
      "Invalid journal packages",
    );
    journal = structuredClone(data);
  }
  async function record(name: string, status: Status) {
    const entry = journal.packages.find((p) => p.name === name);
    ensure(entry !== undefined, "Unexpected journal package");
    entry!.status = status;
    await store.save(structuredClone(journal));
  }
  const guarded: RegistryPort = {
    async read(name, version) {
      const item = candidate.packages.find((p) => p.name === name);
      const state = journal.packages.find((p) => p.name === name);
      ensure(item !== undefined && state !== undefined, "Unexpected package");
      ensure(state!.status !== "conflict", "Conflict requires operator investigation");
      const raw = decodeRegistryRead(await port.read(name, version));
      if (raw.status === "present")
        ensure(raw.bytes.byteLength <= 16 * 1024 * 1024, "Registry response exceeds limit");
      const result =
        raw.status === "present"
          ? { status: "present" as const, bytes: Uint8Array.from(raw.bytes) }
          : raw;
      if (result.status === "absent") {
        ensure(
          state!.status === "not_attempted",
          "Prior outcome cannot be reconciled from absence",
        );
      } else if (result.status === "present" && result.bytes instanceof Uint8Array) {
        const hash = new Bun.CryptoHasher("sha256").update(result.bytes).digest("hex");
        await record(
          name,
          hash === item!.sha256 && result.bytes.byteLength === item!.size ? "verified" : "conflict",
        );
      }
      return result;
    },
    async send(name, version, bytes) {
      await record(name, "unknown");
      await port.send(name, version, bytes);
    },
  };
  return rehearseSingleMaintainer(
    candidate,
    identity.digest,
    identity.sourceCommit,
    snapshots,
    guarded,
  );
}
