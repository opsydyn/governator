import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ensure } from "@governator/core";
import { createSnapshot, loadSnapshot, createQueryService } from "@governator/query";
import { git } from "./source.ts";
import type { CliResult } from "./commands.ts";

export async function runQueryCommand(
  command: string,
  values: Map<string, string>,
): Promise<CliResult> {
  const exporting = command === "snapshot.export";
  const root = await realpath(resolve(values.get("--root") ?? "."));
  if (exporting) {
    const report = values.get("--report"),
      out = values.get("--out");
    ensure(!!report && !!out, "Snapshot export requires --report and --out");
    ensure(
      /^artifacts\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(out),
      "Snapshot output must be a new direct JSON file under ignored artifacts/",
    );
    git(root, ["check-ignore", "--quiet", "--", out]);
    const snapshot = await createSnapshot(root, {
      report,
      ...(values.get("--release") ? { release: values.get("--release")! } : {}),
      ...(values.get("--config") ? { config: values.get("--config")! } : {}),
    });
    await mkdir(join(root, "artifacts"), { recursive: true });
    ensure(
      (await realpath(join(root, "artifacts"))) === join(root, "artifacts"),
      "Symlinked snapshot output directory is forbidden",
    );
    await writeFile(join(root, out), JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx" });
    return {
      code: 0,
      stdout:
        JSON.stringify({
          path: out,
          digest: snapshot.digest,
          sourceCommit: snapshot.sourceCommit,
          provenance: snapshot.provenance,
        }) + "\n",
      stderr: "",
    };
  }
  const path = values.get("--snapshot"),
    tool = values.get("--tool");
  ensure(!!path && !!tool, "Query requires --snapshot and --tool");
  const raw = values.get("--args") ?? "{}";
  ensure(new TextEncoder().encode(raw).length <= 8192, "Query arguments exceed 8 KiB");
  const result = createQueryService(await loadSnapshot(root, path)).query(tool, JSON.parse(raw));
  return { code: 0, stdout: JSON.stringify(result, null, 2) + "\n", stderr: "" };
}
