/* Injected registry fixture deliberately records calls and changes its in-memory state. */
/* oxlint-disable linteffect/no-return-in-arrow */
import { describe, expect, test } from "vitest";
import { createCandidate, candidateDigest } from "../packages/cli/src/first-release-rehearsal.ts";
import {
  rehearseSingleMaintainer,
  type RegistryPort,
} from "../packages/cli/src/single-maintainer-adapter.ts";

const commit = "a".repeat(40);
const archives = [
  { name: "@opsydyn/governator-cli", version: "0.1.0", bytes: Uint8Array.from([1, 2]) },
  { name: "@opsydyn/governator-mcp", version: "0.1.0", bytes: Uint8Array.from([3, 4]) },
  { name: "@opsydyn/storybook-addon-governator", version: "0.1.0", bytes: Uint8Array.from([5, 6]) },
];
function fixture() {
  const stored = new Map<string, Uint8Array>();
  const calls: string[] = [];
  const port: RegistryPort = {
    read: async (name) => {
      calls.push(`read:${name}`);
      const bytes = stored.get(name);
      return bytes ? { status: "present", bytes: Uint8Array.from(bytes) } : { status: "absent" };
    },
    send: async (name, _version, bytes) => {
      calls.push(`send:${name}`);
      stored.set(name, Uint8Array.from(bytes));
    },
  };
  return { stored, calls, port };
}
const candidate = createCandidate(commit, archives);
const digest = candidateDigest(candidate);

describe("single-maintainer adapter fixture", () => {
  test("checks all archives before the first registry operation", async () => {
    const f = fixture();
    const changed = archives.map((item, i) =>
      i === 1 ? { ...item, bytes: Uint8Array.from([9]) } : item,
    );
    await expect(
      rehearseSingleMaintainer(candidate, digest, commit, changed, f.port),
    ).rejects.toThrow();
    await expect(
      rehearseSingleMaintainer(candidate, "0".repeat(64), commit, archives, f.port),
    ).rejects.toThrow();
    await expect(
      rehearseSingleMaintainer(candidate, digest, "b".repeat(40), archives, f.port),
    ).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
  test("preflights every package, sends approved bytes and verifies readback", async () => {
    const f = fixture();
    const result = await rehearseSingleMaintainer(candidate, digest, commit, archives, f.port);
    expect(result.status).toBe("complete");
    expect(result.publishable).toBe(false);
    expect(result.packages.map((x) => x.status)).toEqual(["verified", "verified", "verified"]);
    expect(f.calls.slice(0, 3).every((call) => call.startsWith("read:"))).toBe(true);
    expect(f.calls.filter((call) => call.startsWith("send:"))).toHaveLength(3);
  });
  test("stops before any send on an existing conflicting version or unavailable preflight", async () => {
    const conflict = fixture();
    conflict.stored.set(archives[2]!.name, Uint8Array.from([9]));
    const result = await rehearseSingleMaintainer(
      candidate,
      digest,
      commit,
      archives,
      conflict.port,
    );
    expect(result.status).toBe("stopped");
    expect(result.packages[2]?.status).toBe("conflict");
    expect(conflict.calls.some((call) => call.startsWith("send:"))).toBe(false);
    const failed = fixture();
    failed.port.read = async () => {
      throw new Error("offline");
    };
    expect(
      (await rehearseSingleMaintainer(candidate, digest, commit, archives, failed.port)).status,
    ).toBe("stopped");
    expect(failed.calls).toEqual([]);
  });
  test("records unknown outcome on interrupted send and retries only missing packages", async () => {
    const f = fixture();
    const original = f.port.send;
    let interrupted = true;
    f.port.send = async (name, version, bytes) => {
      await original(name, version, bytes);
      if (name === archives[1]!.name && interrupted) {
        interrupted = false;
        throw new Error("lost response");
      }
    };
    const first = await rehearseSingleMaintainer(candidate, digest, commit, archives, f.port);
    expect(first.status).toBe("stopped");
    expect(first.packages.map((x) => x.status)).toEqual(["verified", "unknown", "not_attempted"]);
    const before = f.calls.filter((call) => call.startsWith("send:")).length;
    const retry = await rehearseSingleMaintainer(candidate, digest, commit, archives, f.port);
    expect(retry.status).toBe("complete");
    expect(retry.packages.map((x) => x.status)).toEqual([
      "already_verified",
      "already_verified",
      "verified",
    ]);
    expect(f.calls.filter((call) => call.startsWith("send:")).length - before).toBe(1);
  });
  test("never treats an acknowledged upload without exact readback as verified", async () => {
    const f = fixture();
    f.port.send = async () => {};
    const result = await rehearseSingleMaintainer(candidate, digest, commit, archives, f.port);
    expect(result.status).toBe("stopped");
    expect(result.packages.map((x) => x.status)).toEqual([
      "unknown",
      "not_attempted",
      "not_attempted",
    ]);
  });
});

test("fails closed on malformed registry responses", async () => {
  const f = fixture();
  f.port.read = async () => null as unknown as Awaited<ReturnType<RegistryPort["read"]>>;
  const result = await rehearseSingleMaintainer(candidate, digest, commit, archives, f.port);
  expect(result.status).toBe("stopped");
  expect(result.packages[0]?.status).toBe("unknown");
});

test("does not verify bytes modified during transfer", async () => {
  const f = fixture();
  f.port.send = async (name, _version, bytes) => {
    bytes[0] = 99;
    f.stored.set(name, bytes);
  };
  const result = await rehearseSingleMaintainer(candidate, digest, commit, archives, f.port);
  expect(result.status).toBe("stopped");
  expect(result.packages[0]?.status).toBe("conflict");
});

test("copies all candidate bytes before registry callbacks can mutate their source", async () => {
  const mutable = archives.map((item) => ({ ...item, bytes: Uint8Array.from(item.bytes) }));
  const f = fixture();
  const read = f.port.read;
  f.port.read = async (name, version) => {
    mutable[1]!.bytes[0] = 99;
    return read(name, version);
  };
  const result = await rehearseSingleMaintainer(candidate, digest, commit, mutable, f.port);
  expect(result.status).toBe("complete");
  expect(f.stored.get(archives[1]!.name)).toEqual(archives[1]!.bytes);
});
