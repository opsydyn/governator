/* oxlint-disable linteffect/no-return-in-arrow, linteffect/no-naked-object-state-update, linteffect/no-string-sentinel-const -- JSON command discovery boundary. */
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { toolNames } from "@governator/query";
import { ensure } from "@governator/core";
import { parseCli } from "./parser.ts";
import type { CliResult } from "./commands.ts";
export async function capabilities(values: Map<string, string>): Promise<CliResult> {
  const format = values.get("--format") ?? "json";
  ensure(["json", "text"].includes(format), "Capabilities format must be json or text");
  const requiredOptions: Record<string, string[]> = {
    "init.plan": ["--config"],
    "init.apply": ["--config", "--revision"],
    "skill.export": ["--out"],
    "snapshot.export": ["--report", "--out"],
    "snapshot.refresh": ["--mapping", "--out"],
    query: ["--snapshot", "--tool"],
    "registry.plan": ["--fields"],
    "registry.register": ["--fields", "--revision"],
    "registry.inspect": ["--story-map", "--story", "--component"],
    "registry.update": ["--story-map", "--story", "--component", "--fields", "--revision"],
    "mapping.plan": ["--component", "--files"],
    "mapping.update": ["--component", "--files", "--revision"],
    "tags.inspect": ["--story-path"],
    "tags.plan": ["--story-path", "--tags"],
    "tags.update": ["--story-path", "--tags", "--revision"],
    check: ["--mapping"],
    "evidence.import": ["--format", "--file", "--mapping"],
    "release.candidate": ["--config", "--out"],
    "release.plan": ["--config"],
    "release.check": ["--config", "--candidate"],
    "contracts.snapshot": ["--config", "--declarations"],
    "contracts.diff": ["--baseline", "--candidate", "--baseline-digest"],
  };
  const commands: { command: string; options: string[]; demo: boolean; effects: string[] }[] = [];
  await parseCli(["--help"], (definition) =>
    commands.push({
      ...definition,
      effects: [
        "check",
        "snapshot.refresh",
        "release.candidate",
        "release.plan",
        "release.check",
      ].includes(definition.command)
        ? ["execute-producers", "write-artifacts"]
        : [
              "init.apply",
              "registry.register",
              "registry.update",
              "mapping.update",
              "tags.update",
            ].includes(definition.command)
          ? ["write-source"]
          : ["skill.export", "snapshot.export"].includes(definition.command)
            ? ["write-files"]
            : ["read"],
    }),
  );
  const manifest = JSON.parse(await readFile(join(import.meta.dirname, "../package.json"), "utf8"));
  const result = {
    schemaVersion: 1,
    package: manifest.name,
    version: manifest.version,
    root: resolve(values.get("--root") ?? "."),
    runtime: { name: "bun", minimumVersion: "1.4.2" },
    commands: commands.map((command) => ({
      ...command,
      requiredOptions: requiredOptions[command.command] ?? [],
    })),
    schemas: { setup: 1, diagnostics: 1, report: [1, 2], snapshot: 1, query: 1 },
    mcp: { mode: "immutable-read-only", tools: toolNames },
    authoring: {
      adapterExport: "./authoring",
      adapterVersion: 1,
      requiredFor: ["tags.inspect", "tags.plan", "tags.update"],
      installedAdapterAssessed: false,
    },
    skill: { name: "governator-onboarding", exportCommand: ["skill", "export", "--out"] },
    limitations: [
      "Capability discovery does not execute commands or assess project readiness",
      "Optional adapter presence is not checked; the selected tags command validates its installed adapter",
    ],
  };
  return {
    code: 0,
    stdout:
      format === "json"
        ? JSON.stringify(result, null, 2) + "\n"
        : commands
            .map((command) => `${command.command}: ${command.effects.join(", ")}`)
            .join("\n") + "\n",
    stderr: "",
  };
}
