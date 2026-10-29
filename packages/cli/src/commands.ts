import { basename, resolve } from "node:path";
import { realpath, readFile } from "node:fs/promises";
import { evaluate, ensure, importVitest } from "@governator/core";
import { loadProject } from "./files.ts";
import { containedFile } from "./files.ts";
import { git } from "./source.ts";
import { runLocalCheck, readMappedTests } from "./evidence.ts";
import type { GovernanceReport } from "@governator/protocol";
import { runRelease } from "./release.ts";
import { runContracts } from "./contracts.ts";
import { runQueryCommand } from "./queries.ts";
import { runRegistryCommand } from "./registry.ts";
import { doctor } from "./doctor.ts";
import { parseCli } from "./parser.ts";

export interface CliResult {
  readonly code: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
}
const help = `governator registry inspect --story-map PATH --story ID --component ID [--root PATH] [--registry PATH] [--working-dir PATH]
governator registry update --story-map PATH --story ID --component ID --revision SHA256 --fields PATH [--root PATH] [--registry PATH] [--working-dir PATH]
governator doctor [--root PATH] [--format json|text]
governator validate [--root PATH]
governator snapshot export --report PATH --out artifacts/NAME.json [--root PATH] [--release PATH --config PATH]
governator query --snapshot PATH --tool NAME [--args JSON] [--root PATH]
governator evaluate [--root PATH] [--target stable] [--component ID]
  [--at YYYY-MM-DDTHH:mm:ss.sssZ] [--format json|text] [--report-schema 1|2] [--demo]
governator evidence import --format vitest --file PATH --mapping PATH [--root PATH] [--commit SHA] [--report-root PATH]
governator check --mapping PATH [--root PATH] [--target stable] [--component ID] [--format json|text] [--report-schema 1|2]
governator release candidate --config PATH --out artifacts/NAME [--root PATH]
governator release plan --config PATH [--candidate PATH] [--root PATH] [--demo]
governator release check --config PATH --candidate PATH [--root PATH] [--demo]
governator contracts snapshot --config PATH --declarations PATH [--root PATH]
governator contracts diff --baseline PATH --candidate PATH --baseline-digest PATH [--root PATH]

Demo mode accepts only labelled demo evidence and never proves publication or deployment.
Raw imports remain unverified. Local check executes installed Vitest 4 in a clean repository; it proves only that local process, never external approval or publication.
`;
export async function executeCli(args: readonly string[]): Promise<CliResult> {
  if (args.length === 0 || args[0] === "--help") return { code: 0, stdout: help, stderr: "" };
  const parsed = await parseCli(args);
  if (parsed.kind === "help") return { code: 0, stdout: parsed.text, stderr: "" };
  const { command, values, demo } = parsed;
  if (command.startsWith("registry.")) return runRegistryCommand(command, values);
  if (command === "doctor")
    return doctor(resolve(values.get("--root") ?? "."), values.get("--format") ?? "text");
  if (command === "snapshot.export" || command === "query") return runQueryCommand(command, values);
  if (command.startsWith("release."))
    return runRelease(command.slice("release.".length), values, demo);
  if (command.startsWith("contracts."))
    return runContracts(command.slice("contracts.".length), values);
  ensure(
    !values.has("--format") ||
      (command === "evidence.import" ? ["vitest"] : ["json", "text"]).includes(
        values.get("--format") ?? "",
      ),
    command === "evidence.import" ? "Import format must be vitest" : "Format must be json or text",
  );
  ensure(
    !values.has("--report-schema") || ["1", "2"].includes(values.get("--report-schema") ?? ""),
    "Report schema must be 1 or 2",
  );
  const reportVersion = values.get("--report-schema") === "2" ? 2 : 1;
  const root = resolve(values.get("--root") ?? ".");
  const project = await loadProject(root);
  if (command === "evidence.import") {
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
          `Governator — ${report.assurance}; policy ${report.policyVersion}; source ${report.commit}`,
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
