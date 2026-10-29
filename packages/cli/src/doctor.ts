/* oxlint-disable linteffect/no-if-statement, linteffect/no-try-catch, linteffect/no-return-in-arrow, linteffect/no-string-sentinel-const, linteffect/no-naked-object-state-update, linteffect/no-boundary-try-catch-without-effect-map -- Read-only diagnostic boundary, executed inside the CLI Effect runtime. */
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { loadProject } from "./files.ts";
import type { CliResult } from "./commands.ts";

type Finding = { id: string; status: "ok" | "attention"; message: string; nextAction?: string };

/** Working-tree diagnostics do not produce evidence or evaluate readiness. */
export async function doctor(root: string, format: string): Promise<CliResult> {
  if (!["json", "text"].includes(format)) throw new Error("doctor format must be json or text");
  const findings: Finding[] = [];
  for (const path of [
    "package.json",
    "governance/components.yaml",
    "governance/policy.yaml",
    "governance/tests.json",
  ]) {
    try {
      const stat = await lstat(resolve(root, path));
      findings.push({
        id: path,
        status: stat.isFile() && !stat.isSymbolicLink() ? "ok" : "attention",
        message:
          stat.isFile() && !stat.isSymbolicLink()
            ? "Regular file present"
            : "Expected a regular file without symlinks",
        nextAction: "Inspect configuration before evidence production",
      });
    } catch {
      findings.push({
        id: path,
        status: "attention",
        message: "File missing or inaccessible",
        nextAction: "Configure this input using the onboarding guide",
      });
    }
  }
  try {
    const project = await loadProject(root);
    findings.push({
      id: "configuration",
      status: "ok",
      message: `Valid registry: ${project.registry.components.length} components; policy ${project.policy.policyVersion}`,
    });
  } catch (error) {
    findings.push({
      id: "configuration",
      status: "attention",
      message: String(error),
      nextAction: "Correct configuration, then run governator validate",
    });
  }
  const git = Bun.spawnSync(
    ["git", "-C", root, "status", "--porcelain=v1", "--untracked-files=normal"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const clean = git.exitCode === 0 && git.stdout.toString().trim() === "";
  findings.push({
    id: "source",
    status: clean ? "ok" : "attention",
    message: clean ? "Git working tree is clean" : "Working tree is dirty or Git is unavailable",
    nextAction:
      "Review changes and obtain authorization before committing; source-bound production requires committed inputs",
  });
  const result = {
    schemaVersion: 1,
    scope: "working-tree-diagnostics",
    root,
    evidenceProduced: false,
    findings,
  };
  return {
    code: findings.some((item) => item.status === "attention") ? 1 : 0,
    stdout:
      format === "json"
        ? JSON.stringify(result, null, 2) + "\n"
        : findings.map((item) => `${item.status}: ${item.id}: ${item.message}`).join("\n") + "\n",
    stderr: "",
  };
}
