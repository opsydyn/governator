/* oxlint-disable linteffect/no-return-in-arrow, linteffect/no-try-catch */
import { expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { candidateDigest, createCandidate } from "../packages/cli/src/first-release-rehearsal.ts";
import {
  exerciseDurablePhase,
  exerciseSealedCoordinator,
} from "../scripts/qualify-sealed-coordinator.ts";
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

test("disk journal recovers an interrupted sealed fixture across coordinator sessions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sealed-journal-"));
  const stored = new Map<string, Uint8Array>();
  const sent: string[] = [];
  const port: RegistryPort = {
    async read(name) {
      const bytes = stored.get(name);
      return bytes ? { status: "present", bytes } : { status: "absent" };
    },
    async send(name, _version, bytes) {
      sent.push(name);
      stored.set(name, Uint8Array.from(bytes));
    },
  };
  try {
    const first = await exerciseDurablePhase(
      candidate,
      candidateDigest(candidate),
      commit,
      archives,
      port,
      directory,
      "123",
      "interrupt",
      () => {
        throw new Error("lost response");
      },
    );
    expect(first.status).toBe("stopped");
    const second = await exerciseDurablePhase(
      candidate,
      candidateDigest(candidate),
      commit,
      archives,
      port,
      directory,
      "123",
      "resume",
      () => {
        throw new Error("unexpected interruption");
      },
    );
    expect(second.status).toBe("complete");
    expect(sent).toEqual(archives.map((item) => item.name));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SIGKILL leaves the disk journal recoverable in a new process", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sealed-process-"));
  const journalDirectory = join(directory, "journal");
  const registryFile = join(directory, "registry.json");
  await mkdir(journalDirectory, { mode: 0o700 });
  await writeFile(registryFile, "{}");
  const moduleUrl = new URL("../scripts/qualify-sealed-coordinator.ts", import.meta.url).href;
  const candidateUrl = new URL("../packages/cli/src/first-release-rehearsal.ts", import.meta.url)
    .href;
  const source = (phase: string) => `
import { readFile, writeFile } from 'node:fs/promises';
import { exerciseDurablePhase } from ${JSON.stringify(moduleUrl)};
import { createCandidate, candidateDigest } from ${JSON.stringify(candidateUrl)};
const archives = ${JSON.stringify(archives.map((p) => ({ ...p, bytes: Array.from(p.bytes) })))}.map(p => ({...p, bytes: Uint8Array.from(p.bytes)}));
const candidate = createCandidate(${JSON.stringify(commit)}, archives);
const path = ${JSON.stringify(registryFile)};
const port = {
 async read(name) { const all = JSON.parse(await readFile(path,'utf8')); return all[name] ? {status:'present',bytes:Uint8Array.from(all[name])} : {status:'absent'}; },
 async send(name, _version, bytes) { const all = JSON.parse(await readFile(path,'utf8')); if (all[name]) throw Error('duplicate'); all[name] = Array.from(bytes); await writeFile(path,JSON.stringify(all)); }
};
const result = await exerciseDurablePhase(candidate, candidateDigest(candidate), ${JSON.stringify(commit)}, archives, port, ${JSON.stringify(journalDirectory)}, '123', ${JSON.stringify(phase)}, () => { process.kill(process.pid, 'SIGKILL'); throw Error('signal failed'); });
if (result.status !== 'complete') process.exit(2);
`;
  async function run(phase: string) {
    return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        const child = spawn(process.execPath, ["--eval", source(phase)], { stdio: "ignore" });
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, 10000);
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("close", (code, signal) => {
          clearTimeout(timer);
          if (timedOut) reject(new Error("Fixture child timed out"));
          else resolve({ code, signal });
        });
      },
    );
  }
  try {
    expect((await run("interrupt")).signal).toBe("SIGKILL");
    const before = JSON.parse(await readFile(join(journalDirectory, "journal.json"), "utf8"));
    expect(before.packages.map((item: { status: string }) => item.status)).toEqual([
      "verified",
      "unknown",
      "not_attempted",
    ]);
    await rmdir(join(journalDirectory, "journal.lock"));
    expect((await run("resume")).code).toBe(0);
    const after = JSON.parse(await readFile(join(journalDirectory, "journal.json"), "utf8"));
    expect(after.packages.map((item: { status: string }) => item.status)).toEqual([
      "verified",
      "verified",
      "verified",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
