/* Local qualification coordinator. RegistryPort is injected; no live npm transport or authorization is provided. */
/* oxlint-disable linteffect/no-string-sentinel-const, linteffect/no-return-in-arrow, linteffect/no-try-catch, linteffect/no-if-statement, linteffect/no-ternary, linteffect/no-effect-wrapper-alias, linteffect/no-naked-object-state-update, linteffect/no-magic-domain-string */
import { Effect, Result, Schema } from "effect";
import { ensure } from "@governator/core";
import { candidateDigest, createCandidate } from "./first-release-rehearsal.ts";
import type { Archive, Candidate } from "./first-release-rehearsal.ts";

export type RegistryRead = { status: "absent" } | { status: "present"; bytes: Uint8Array };
export type RegistryPort = {
  read(name: string, version: string): Promise<RegistryRead>;
  send(name: string, version: string, bytes: Uint8Array): Promise<void>;
};
type PackageStatus = "not_attempted" | "already_verified" | "verified" | "unknown" | "conflict";
type Outcome = { name: string; status: PackageStatus };
function matches(bytes: Uint8Array, expected: Candidate["packages"][number]): boolean {
  return (
    bytes.byteLength === expected.size &&
    new Bun.CryptoHasher("sha256").update(bytes).digest("hex") === expected.sha256
  );
}
const registryRead = Schema.Union([
  Schema.Struct({ status: Schema.Literal("absent") }),
  Schema.Struct({ status: Schema.Literal("present"), bytes: Schema.Uint8Array }),
]);
export function decodeRegistryRead(value: unknown): RegistryRead {
  return Schema.decodeUnknownSync(registryRead, { onExcessProperty: "error" })(value);
}
async function safeRead(port: RegistryPort, entry: Candidate["packages"][number]) {
  const attempt = Effect.tryPromise({
    try: async () => {
      const value = decodeRegistryRead(await port.read(entry.name, entry.version));
      if (value.status === "present") {
        ensure(value.bytes.byteLength <= 16 * 1024 * 1024, "Registry response exceeds size limit");
        return { status: "present" as const, bytes: Uint8Array.from(value.bytes) };
      }
      return value;
    },
    catch: () => "unavailable" as const,
  });
  const observed = Effect.result(attempt);
  return Effect.runPromise(observed);
}
async function safeSend(
  port: RegistryPort,
  entry: Candidate["packages"][number],
  bytes: Uint8Array,
) {
  const attempt = Effect.tryPromise({
    try: () => port.send(entry.name, entry.version, Uint8Array.from(bytes)),
    catch: () => "uncertain" as const,
  });
  const sent = Effect.result(attempt);
  return Effect.runPromise(sent);
}

/** Only an injected fixture port is supplied by this repository; results do not authorize publication. */
export async function rehearseSingleMaintainer(
  candidate: unknown,
  reviewedDigest: string,
  sourceCommit: string,
  archives: readonly Archive[],
  port: RegistryPort,
) {
  ensure(candidateDigest(candidate) === reviewedDigest, "Candidate review digest mismatch");
  // Take private copies of all inputs before the first external operation.
  const snapshots = archives
    .map((item) => ({ name: item.name, version: item.version, bytes: Uint8Array.from(item.bytes) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const verified = createCandidate(sourceCommit, snapshots);
  ensure(candidateDigest(verified) === reviewedDigest, "Candidate source or archive bytes changed");
  const outcomes: Outcome[] = verified.packages.map((item) => ({
    name: item.name,
    status: "not_attempted",
  }));
  const result = (status: "complete" | "stopped") => ({
    mode: "injected-registry-rehearsal" as const,
    publishable: false as const,
    sourceCommit,
    reviewedDigest,
    status,
    packages: outcomes,
  });
  // Preflight the entire set before any write.
  for (let i = 0; i < verified.packages.length; i++) {
    const entry = verified.packages[i]!;
    const observed = await safeRead(port, entry);
    if (Result.isFailure(observed)) {
      outcomes[i]!.status = "unknown";
      return result("stopped");
    }
    if (observed.success.status === "present") {
      if (
        !(observed.success.bytes instanceof Uint8Array) ||
        !matches(observed.success.bytes, entry)
      ) {
        outcomes[i]!.status = "conflict";
        return result("stopped");
      }
      outcomes[i]!.status = "already_verified";
    } else if (observed.success.status !== "absent") {
      outcomes[i]!.status = "unknown";
      return result("stopped");
    }
  }
  for (let i = 0; i < verified.packages.length; i++) {
    const entry = verified.packages[i]!;
    if (outcomes[i]!.status === "already_verified") continue;
    // Recheck just before sending; this is not an atomic registry reservation.
    const before = await safeRead(port, entry);
    if (Result.isFailure(before)) {
      outcomes[i]!.status = "unknown";
      return result("stopped");
    }
    if (before.success.status === "present") {
      if (!(before.success.bytes instanceof Uint8Array) || !matches(before.success.bytes, entry)) {
        outcomes[i]!.status = "conflict";
        return result("stopped");
      }
      outcomes[i]!.status = "already_verified";
      continue;
    }
    if (before.success.status !== "absent") {
      outcomes[i]!.status = "unknown";
      return result("stopped");
    }
    const sent = await safeSend(port, entry, snapshots[i]!.bytes);
    if (Result.isFailure(sent)) {
      outcomes[i]!.status = "unknown";
      return result("stopped");
    }
    const after = await safeRead(port, entry);
    if (Result.isFailure(after) || after.success.status !== "present") {
      outcomes[i]!.status = "unknown";
      return result("stopped");
    }
    if (!(after.success.bytes instanceof Uint8Array) || !matches(after.success.bytes, entry)) {
      outcomes[i]!.status = "conflict";
      return result("stopped");
    }
    outcomes[i]!.status = "verified";
  }
  return result("complete");
}
