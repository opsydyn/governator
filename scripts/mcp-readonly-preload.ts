/** Qualification-only guard. Never loaded by the normal MCP launcher. */
import fs from "node:fs";
import fsp from "node:fs/promises";
import childProcess from "node:child_process";
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
let serving = false,
  blockedCalls = 0,
  startupGitReads = 0;
function denied(): never {
  blockedCalls++;
  throw new Error("Readonly qualification guard rejected process, network or filesystem mutation");
}
const spawnSync = Bun.spawnSync.bind(Bun);
Bun.spawnSync = ((...args: Parameters<typeof Bun.spawnSync>) => {
  const command = args[0];
  if (
    !serving &&
    Array.isArray(command) &&
    command[0] === "git" &&
    command[1] === "-c" &&
    command[2] === "core.fsmonitor=false" &&
    command[3] === "-c" &&
    command[4] === "core.untrackedCache=false" &&
    command[5] === "-c" &&
    command[6] === "core.hooksPath=/dev/null" &&
    command[7] === "-C" &&
    ["rev-parse", "ls-files", "status"].includes(String(command[9]))
  ) {
    startupGitReads++;
    return spawnSync(...args);
  }
  return denied();
}) as typeof Bun.spawnSync;
Bun.spawn = denied;
Bun.write = denied;
for (const name of [
  "writeFile",
  "appendFile",
  "mkdir",
  "rm",
  "rmdir",
  "rename",
  "unlink",
  "symlink",
  "link",
  "copyFile",
  "cp",
  "chmod",
  "chown",
  "truncate",
  "utimes",
  "open",
]) {
  Reflect.set(fs, name, denied);
  Reflect.set(fs, name + "Sync", denied);
  Reflect.set(fsp, name, denied);
}
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"])
  Reflect.set(childProcess, name, denied);
for (const object of [net, tls])
  for (const name of ["connect", "createConnection", "createServer"])
    Reflect.set(object, name, denied);
for (const object of [http, https])
  for (const name of ["request", "get", "createServer"]) Reflect.set(object, name, denied);
Reflect.set(globalThis, "fetch", denied);
Reflect.set(globalThis, "WebSocket", denied);
syncBuiltinESMExports();
const write = process.stdout.write.bind(process.stdout);
process.stdout.write = ((...args: Parameters<typeof process.stdout.write>) => {
  serving = true;
  return write(...args);
}) as typeof process.stdout.write;
process.on("exit", () =>
  process.stderr.write(
    JSON.stringify({ readonlyAudit: { serving, blockedCalls, startupGitReads } }) + "\n",
  ),
);
