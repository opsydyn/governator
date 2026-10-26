import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { ensure } from "@governanator/core";
import {
  snapshotApi,
  diffApi,
  decodeApiSnapshot,
  checkApiVersions,
} from "@governanator/versioning";
import { containedFile } from "./files.ts";
import type { CliResult } from "./commands.ts";
export async function runContracts(args: readonly string[]): Promise<CliResult> {
  const command = args[0];
  ensure(command === "snapshot" || command === "diff", "Expected contracts snapshot or diff");
  const values = new Map<string, string>();
  const allowed =
    command === "snapshot"
      ? ["--root", "--config", "--declarations"]
      : ["--root", "--baseline", "--candidate", "--baseline-digest"];
  for (let i = 1; i < args.length; i++) {
    const key = args[i] ?? "";
    ensure(
      allowed.includes(key) && !values.has(key),
      `Unknown or duplicate contracts option: ${key}`,
    );
    const value = args[++i];
    ensure(!!value && !value.startsWith("--"), `Missing ${key} value`);
    values.set(key, value);
  }
  const root = resolve(values.get("--root") ?? ".");
  async function input(key: string) {
    const path = values.get(key);
    ensure(!!path, `Required option ${key}`);
    return readFile(await containedFile(root, path), "utf8");
  }
  if (command === "snapshot") {
    const snapshot = snapshotApi(
      await input("--declarations"),
      JSON.parse(await input("--config")),
    );
    return { code: 0, stdout: JSON.stringify(snapshot, null, 2) + "\n", stderr: "" };
  }
  const baseline = decodeApiSnapshot(JSON.parse(await input("--baseline")));
  const candidate = decodeApiSnapshot(JSON.parse(await input("--candidate")));
  const diff = diffApi(baseline, candidate, (await input("--baseline-digest")).trim());
  const checked = checkApiVersions(baseline, candidate, diff);
  return {
    code: checked.gate === "ready" ? 0 : 1,
    stdout: JSON.stringify({ ...diff, ...checked }, null, 2) + "\n",
    stderr: "",
  };
}
