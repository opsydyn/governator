/* oxlint-disable linteffect/no-try-catch, linteffect/no-if-statement, linteffect/no-boundary-try-catch-without-effect-map -- Snapshot refresh IO runs inside the mapped CLI Effect boundary. */
import { access, mkdir, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ensure } from "@governator/core";
import { createSnapshot, loadSnapshot, createQueryService } from "@governator/query";
import { git } from "./source.ts";
import { runLocalCheck } from "./evidence.ts";
import type { CliResult } from "./commands.ts";

export async function runQueryCommand(
  command: string,
  values: Map<string, string>,
): Promise<CliResult> {
  const refreshing = command === "snapshot.refresh";
  const exporting = command === "snapshot.export" || refreshing;
  const root = await realpath(resolve(values.get("--root") ?? "."));
  if (exporting) {
    let report = values.get("--report");
    const out = values.get("--out");
    ensure((!!report || refreshing) && !!out, "Snapshot export requires --report and --out");
    ensure(
      /^artifacts\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(out),
      "Snapshot output must be a new direct JSON file under ignored artifacts/",
    );
    git(root, ["check-ignore", "--quiet", "--", out]);
    if (refreshing) {
      ensure(
        !values.has("--release") && !values.has("--config"),
        "Refresh produces a governance-only snapshot; use export with an explicitly combined governance/release report",
      );
      ensure(
        !!values.get("--mapping"),
        "Snapshot refresh requires --mapping and executes its configured tests",
      );
      await mkdir(join(root, "artifacts"), { recursive: true });
      ensure(
        (await realpath(join(root, "artifacts"))) === join(root, "artifacts"),
        "Symlinked snapshot output directory is forbidden",
      );
      let exists = false;
      try {
        await access(join(root, out));
        exists = true;
      } catch (error) {
        ensure(
          (error as NodeJS.ErrnoException).code === "ENOENT",
          "Cannot inspect snapshot destination",
        );
      }
      ensure(!exists, "Snapshot destination already exists");
      const checked = await runLocalCheck(
        root,
        values.get("--mapping")!,
        values.get("--target") ?? "stable",
        2,
      );
      report = `artifacts/refresh-${crypto.randomUUID()}.json`;
      await writeFile(join(root, report), JSON.stringify(checked.report, null, 2) + "\n", {
        flag: "wx",
      });
    }
    ensure(!!report, "Report missing");
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
          report,
          nextAction:
            "Restart the MCP server with this snapshot; existing sessions retain their previous snapshot",
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
