import { basename, resolve } from "node:path";
import { evaluate, ensure } from "@governanator/core";
import { loadProject } from "./files.ts";

export interface CliResult {
  readonly code: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
}
const help = `governanator validate [--root PATH]
governanator evaluate [--root PATH] [--target stable] [--component ID]
  [--at YYYY-MM-DDTHH:mm:ss.sssZ] [--format json|text] [--demo]

Demo mode accepts only labelled demo evidence and never proves publication or deployment.
Normal evaluation uses Git HEAD and requires tracked source files; M0 has no external trust adapters.
`;
function options(args: readonly string[]): {
  command: string;
  values: Map<string, string>;
  demo: boolean;
} {
  if (!args.length || args[0] === "--help")
    return { command: "help", values: new Map(), demo: false };
  const command = args[0] ?? "";
  ensure(command === "validate" || command === "evaluate", `Unknown command: ${command}`);
  const values = new Map<string, string>();
  let demo = false;
  const allowed = new Set(["--root", "--target", "--component", "--at", "--format"]);
  for (let i = 1; i < args.length; i++) {
    const key = args[i] ?? "";
    if (key === "--demo") {
      ensure(!demo, "Duplicate --demo");
      demo = true;
      continue;
    }
    ensure(allowed.has(key), `Unknown option: ${key}`);
    ensure(!values.has(key), `Duplicate option: ${key}`);
    const value = args[++i];
    ensure(!!value && !value.startsWith("--"), `Missing value for ${key}`);
    values.set(key, value);
  }
  ensure(
    !values.has("--format") || ["json", "text"].includes(values.get("--format") ?? ""),
    "Format must be json or text",
  );
  return { command, values, demo };
}
function git(root: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  ensure(
    result.exitCode === 0,
    `Git source verification failed: ${result.stderr.toString().trim()}`,
  );
  return result.stdout.toString().trim();
}
export async function executeCli(args: readonly string[]): Promise<CliResult> {
  const { command, values, demo } = options(args);
  if (command === "help") return { code: 0, stdout: help, stderr: "" };
  const root = resolve(values.get("--root") ?? ".");
  const project = await loadProject(root);
  if (command === "validate")
    return {
      code: 0,
      stdout: `Valid: ${project.registry.components.length} components; policy ${project.policy.policyVersion}\n`,
      stderr: "",
    };
  const commit = demo ? "a".repeat(40) : git(root, ["rev-parse", "--verify", "HEAD"]);
  if (!demo) {
    for (const component of project.registry.components)
      for (const path of [component.source, ...component.stories])
        git(root, ["ls-files", "--error-unmatch", "--", path]);
    const dirty = git(root, [
      "status",
      "--porcelain",
      "--",
      "governance",
      ...project.registry.components.flatMap((c) => [c.source, ...c.stories]),
    ]);
    ensure(
      dirty.length === 0,
      "Uncommitted governance or source inputs: cannot attribute a dirty snapshot to Git HEAD",
    );
  }
  const report = evaluate({
    ...project,
    commit,
    repository: demo ? "demo" : `local:${basename(root)}`,
    target: values.get("--target") ?? "stable",
    at: values.get("--at") ?? new Date().toISOString(),
    mode: demo ? "demo" : "verified",
    verifiedEvidenceDigests: {},
    verifiedWaiverDigests: {},
  });
  const selected = values.get("--component");
  if (selected)
    ensure(
      report.decisions.some((c) => c.componentId === selected),
      `Unknown component: ${selected}`,
    );
  const filtered = {
    ...report,
    decisions: report.decisions.filter((c) => !selected || c.componentId === selected),
  };
  const stdout =
    values.get("--format") === "json"
      ? `${JSON.stringify(filtered, null, 2)}\n`
      : [
          `Governanator — ${report.assurance}; policy ${report.policyVersion}; source ${report.commit}`,
          ...filtered.decisions.flatMap((c) => [
            `${c.componentId} [contract ${c.contractVersion}; package ${c.packageVersion ?? "unknown"}]: ${c.lifecycle} -> ${c.target}: ${c.gate}`,
            ...c.checks.map((check) => `  ${check.check}: ${check.result} — ${check.reason}`),
            ...c.reasons
              .filter((reason) => !c.checks.some((check) => reason.startsWith(`${check.check}:`)))
              .map((reason) => `  ${reason}`),
          ]),
          "Publication: unknown; deployment: unknown; adoption: unknown",
          "",
        ].join("\n");
  return { code: filtered.decisions.every((c) => c.gate === "ready") ? 0 : 1, stdout, stderr: "" };
}
