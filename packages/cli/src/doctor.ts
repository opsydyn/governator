/* oxlint-disable linteffect/no-if-statement, linteffect/no-try-catch, linteffect/no-return-in-arrow, linteffect/no-string-sentinel-const, linteffect/no-naked-object-state-update, linteffect/no-boundary-try-catch-without-effect-map -- Read-only diagnostic boundary, executed inside the CLI Effect runtime. */
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { decodeReport } from "@governator/core";
import { loadSnapshot } from "@governator/query";
import { loadProject, containedFile } from "./files.ts";
import type { CliResult } from "./commands.ts";

type Finding = { id: string; status: "ok" | "attention"; message: string; nextAction?: string };

/** Working-tree diagnostics do not produce evidence or evaluate readiness. */
export async function doctor(
  root: string,
  format: string,
  selection: Map<string, string> = new Map(),
): Promise<CliResult> {
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
  const head = Bun.spawnSync(["git", "-C", root, "rev-parse", "--verify", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const sourceCommit = head.exitCode === 0 ? head.stdout.toString().trim() : null;
  for (const dependency of [
    "@opsydyn/governator-cli",
    "@opsydyn/governator-mcp",
    "@opsydyn/storybook-addon-governator",
    "vitest",
  ]) {
    try {
      findings.push({
        id: `dependency:${dependency}`,
        status: "ok",
        message: `Resolvable at ${Bun.resolveSync(dependency, root)}`,
      });
    } catch {
      findings.push({
        id: `dependency:${dependency}`,
        status: "attention",
        message: "Not resolvable from project root (may be installed in a child workspace)",
        nextAction: `Install ${dependency} if required by the selected workflow, or select its workspace as --root`,
      });
    }
  }
  for (const kind of ["report", "snapshot"]) {
    const selected = selection.get(`--${kind}`);
    if (!selected) {
      findings.push({
        id: kind,
        status: "attention",
        message: "No artifact selected; freshness was not assessed",
        nextAction: `Pass --${kind} with a contained artifact path`,
      });
      continue;
    }
    try {
      const path = await containedFile(root, selected);
      const stat = await lstat(path);
      if (stat.size > 8 * 1024 * 1024) throw new Error("Artifact exceeds 8 MiB");
      if (kind === "snapshot") {
        const snapshot = await loadSnapshot(root, selected);
        findings.push({
          id: kind,
          status: "ok",
          message: `Verified snapshot structure, referenced inputs, digest and expiry for ${snapshot.sourceCommit}`,
        });
      } else {
        const report = decodeReport(JSON.parse(await readFile(path, "utf8")));
        const age = Date.now() - Date.parse(report.evaluatedAt);
        if (report.commit !== sourceCommit || age < -60000 || age > 86400000 || !clean)
          throw new Error("Report source/time differs from the current clean checkout");
        findings.push({
          id: kind,
          status: "ok",
          message: `Report source/time matches ${report.commit}; saved report producer trust remains unverified`,
        });
      }
    } catch (error) {
      findings.push({
        id: kind,
        status: "attention",
        message: String(error),
        nextAction:
          "Review source changes; collect fresh evidence, export to a new snapshot and restart MCP",
      });
    }
  }
  const result = {
    sourceCommit,
    schemaVersion: 1,
    scope: "working-tree-diagnostics",
    root,
    evidenceProduced: false,
    findings: findings.map((finding) => ({
      ...finding,
      remediation:
        finding.status === "ok"
          ? []
          : [
              {
                kind: "manual-action",
                description: finding.nextAction ?? "Inspect this diagnostic",
              },
            ],
    })),
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
