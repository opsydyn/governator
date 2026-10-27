import { mkdtemp, mkdir, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { evaluate } from "../packages/core/src/index.ts";
import { registry, policy, evidence } from "./fixtures.ts";
export async function queryProject(components: typeof registry.components = registry.components) {
  const at = new Date().toISOString();
  const selectedRegistry = { ...registry, components };
  const root = await realpath(await mkdtemp(join(tmpdir(), "governanator-query-")));
  for (const dir of ["governance", "fixtures", "artifacts"]) await mkdir(join(root, dir));
  const files: Record<string, string> = {
    ".gitignore": "artifacts/\nnode_modules\n",
    "fixtures/Button.ts": "export {};",
    "fixtures/Button.stories.ts": "export {};",
    "governance/components.yaml": JSON.stringify(selectedRegistry),
    "governance/policy.yaml": JSON.stringify(policy),
    "governance/evidence.json": JSON.stringify([evidence]),
    "governance/waivers.json": "[]",
  };
  for (const [path, text] of Object.entries(files)) await writeFile(join(root, path), text);
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", [
    "-C",
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "Snapshot fixture",
  ]);
  const commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const report = evaluate({
    registry: selectedRegistry,
    policy,
    evidence: [
      {
        ...evidence,
        commit,
        repository: "local:fixture",
        observedAt: at,
        expiresAt: new Date(Date.parse(at) + 3600000).toISOString(),
      },
    ],
    waivers: [],
    target: "stable",
    at,
    commit,
    repository: "local:fixture",
    mode: "demo",
    verifiedEvidenceDigests: {},
    verifiedWaiverDigests: {},
  });
  await writeFile(join(root, "artifacts/report.json"), JSON.stringify(report));
  return { root, at, now: Date.parse(at), report, commit };
}
