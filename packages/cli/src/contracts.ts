import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { ensure } from "@governator/core";
import { snapshotApi, diffApi, decodeApiSnapshot, checkApiVersions } from "@governator/versioning";
import { containedFile } from "./files.ts";
import type { CliResult } from "./commands.ts";
export async function runContracts(
  command: string,
  values: Map<string, string>,
): Promise<CliResult> {
  ensure(command === "snapshot" || command === "diff", "Expected contracts snapshot or diff");
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
