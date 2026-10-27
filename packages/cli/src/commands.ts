import { basename, resolve } from "node:path";
import { realpath, readFile } from "node:fs/promises";
import { evaluate, ensure, importVitest } from "@governanator/core";
import { loadProject } from "./files.ts";
import { containedFile } from "./files.ts";
import { git } from "./source.ts";
import { runLocalCheck, readMappedTests } from "./evidence.ts";
import type { GovernanceReport } from "@governanator/protocol";
import { runRelease } from "./release.ts";
import { runContracts } from "./contracts.ts";
import { runQueryCommand } from "./queries.ts";

export interface CliResult {
  readonly code: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
}
const help = `governanator validate [--root PATH]
governanator snapshot export --report PATH --out artifacts/NAME.json [--root PATH] [--release PATH --config PATH]
governanator query --snapshot PATH --tool NAME [--args JSON] [--root PATH]
governanator evaluate [--root PATH] [--target stable] [--component ID]
  [--at YYYY-MM-DDTHH:mm:ss.sssZ] [--format json|text] [--report-schema 1|2] [--demo]
governanator evidence import --format vitest --file PATH --mapping PATH [--root PATH] [--commit SHA] [--report-root PATH]
governanator check --mapping PATH [--root PATH] [--target stable] [--component ID] [--format json|text] [--report-schema 1|2]
governanator release candidate --config PATH --out artifacts/NAME [--root PATH]
governanator release plan --config PATH [--candidate PATH] [--root PATH] [--demo]
governanator release check --config PATH --candidate PATH [--root PATH] [--demo]
governanator contracts snapshot --config PATH --declarations PATH [--root PATH]
governanator contracts diff --baseline PATH --candidate PATH --baseline-digest PATH [--root PATH]

Demo mode accepts only labelled demo evidence and never proves publication or deployment.
Raw imports remain unverified. Local check executes installed Vitest 4 in a clean repository; it proves only that local process, never external approval or publication.
`;
function options(args: readonly string[]): {
  command: string;
  values: Map<string, string>;
  demo: boolean;
} {
  if (!args.length || args[0] === "--help")
    return { command: "help", values: new Map(), demo: false };
  const importing = args[0] === "evidence";
  if (importing) ensure(args[1] === "import", "Expected evidence import");
  const command = importing ? "import" : (args[0] ?? "");
  ensure(
    ["validate", "evaluate", "check", "import"].includes(command),
    `Unknown command: ${command}`,
  );
  const values = new Map<string, string>();
  let demo = false;
  const allowed = new Set(
    command === "import"
      ? ["--root", "--format", "--file", "--mapping", "--commit", "--report-root"]
      : command === "check"
        ? ["--root", "--format", "--mapping", "--target", "--component", "--report-schema"]
        : ["--root", "--target", "--component", "--at", "--format", "--report-schema"],
  );
  for (let i = importing ? 2 : 1; i < args.length; i++) {
    const key = args[i] ?? "";
    if (key === "--demo") {
      ensure(command === "evaluate", "--demo is only valid for evaluate");
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
    !values.has("--format") ||
      (command === "import" ? ["vitest"] : ["json", "text"]).includes(values.get("--format") ?? ""),
    command === "import" ? "Import format must be vitest" : "Format must be json or text",
  );
  ensure(
    !values.has("--report-schema") || ["1", "2"].includes(values.get("--report-schema") ?? ""),
    "Report schema must be 1 or 2",
  );
  return { command, values, demo };
}
export async function executeCli(args: readonly string[]): Promise<CliResult> {
  if (args[0] === "snapshot" || args[0] === "query") return runQueryCommand(args);
  if (args[0] === "release") return runRelease(args.slice(1));
  if (args[0] === "contracts") return runContracts(args.slice(1));
  const { command, values, demo } = options(args);
  if (command === "help") return { code: 0, stdout: help, stderr: "" };
  const reportVersion = values.get("--report-schema") === "2" ? 2 : 1;
  const root = resolve(values.get("--root") ?? ".");
  const project = await loadProject(root);
  if (command === "import") {
    ensure(
      values.get("--format") === "vitest" && values.has("--file") && values.has("--mapping"),
      "evidence import requires --format vitest --file PATH --mapping PATH",
    );
    const mapping = await readMappedTests(root, project, values.get("--mapping") ?? "");
    const imported = importVitest(
      JSON.parse(await readFile(await containedFile(root, values.get("--file") ?? ""), "utf8")),
      {
        root: values.get("--report-root") ?? (await realpath(root)),
        registry: project.registry,
        mapping,
        commit: values.get("--commit") ?? git(root, ["rev-parse", "--verify", "HEAD"]),
        repository: `local:${basename(root)}`,
      },
    );
    return { code: 0, stdout: JSON.stringify(imported, null, 2) + "\n", stderr: "" };
  }
  if (command === "check") {
    ensure(values.has("--mapping"), "check requires --mapping PATH");
    if (values.has("--component"))
      ensure(
        project.registry.components.some((c) => c.id === values.get("--component")),
        "Unknown component",
      );
    const checked = await runLocalCheck(
      root,
      values.get("--mapping") ?? "",
      values.get("--target") ?? "stable",
      reportVersion,
    );
    const result = renderReport(checked.report, values);
    return { ...result, stderr: `Local run proof: ${checked.receiptPath}\n` };
  }
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
  const report = evaluate(
    {
      ...project,
      commit,
      repository: demo ? "demo" : `local:${basename(root)}`,
      target: values.get("--target") ?? "stable",
      at: values.get("--at") ?? new Date().toISOString(),
      mode: demo ? "demo" : "verified",
      verifiedEvidenceDigests: {},
      verifiedWaiverDigests: {},
    },
    reportVersion,
  );
  return renderReport(report, values);
}
function renderReport(report: GovernanceReport, values: Map<string, string>): CliResult {
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
