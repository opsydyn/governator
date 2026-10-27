import { lstat, realpath, readFile, stat } from "node:fs/promises";
import { relative, resolve, isAbsolute } from "node:path";
import { parse } from "yaml";
import {
  decode,
  decodeRegistry,
  decodePolicy,
  decodeEvidence,
  Waiver,
  ensure,
  GovernanceError,
  unique,
  validTimestamp,
} from "@governanator/core";

export async function containedFile(root: string, path: string): Promise<string> {
  const canonicalRoot = await realpath(root);
  const canonicalFile = await realpath(resolve(canonicalRoot, path));
  const remainder = relative(canonicalRoot, canonicalFile);
  ensure(
    remainder !== ".." && !remainder.startsWith("../") && !isAbsolute(remainder),
    `Path escapes outside repository: ${path}`,
  );
  ensure(
    canonicalFile === resolve(canonicalRoot, path),
    `Symlinked inputs are unsupported in M0; cannot attribute their targets to the declared Git path: ${path}`,
  );
  ensure((await stat(canonicalFile)).isFile(), `Expected file: ${path}`);
  return canonicalFile;
}
function optionalAbsent(cause: unknown): false {
  if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT")
    return false;
  throw new GovernanceError({ message: String(cause) });
}
async function readInput(root: string, path: string, optional = false): Promise<unknown> {
  if (optional) {
    const exists = await lstat(resolve(root, path)).then(() => true, optionalAbsent);
    if (!exists) return [];
  }
  const read = async (): Promise<unknown> => {
    const target = await containedFile(root, path);
    ensure(Bun.file(target).size <= 4 * 1024 * 1024, `Governance input exceeds 4 MiB: ${path}`);
    const bytes = await readFile(target);
    ensure(bytes.length <= 4 * 1024 * 1024, `Governance input exceeds 4 MiB: ${path}`);
    const content = bytes.toString("utf8");
    return path.endsWith(".json") ? JSON.parse(content) : parse(content, { maxAliasCount: 100 });
  };
  return read().catch((cause: unknown) => {
    throw new GovernanceError({ message: `${path}: ${String(cause)}` });
  });
}
export async function loadProject(root: string) {
  const registry = decodeRegistry(await readInput(root, "governance/components.yaml"));
  const policy = decodePolicy(await readInput(root, "governance/policy.yaml"));
  const rawEvidence = await readInput(root, "governance/evidence.json", true);
  const rawWaivers = await readInput(root, "governance/waivers.json", true);
  ensure(Array.isArray(rawEvidence), "governance/evidence.json must be an array");
  ensure(Array.isArray(rawWaivers), "governance/waivers.json must be an array");
  const evidence = rawEvidence.map(decodeEvidence);
  const waivers = rawWaivers.map((item) => decode(Waiver, item));
  unique(
    evidence.map((e) => e.id),
    "evidence ID",
  );
  unique(
    waivers.map((w) => w.id),
    "waiver ID",
  );
  waivers.forEach((w) => {
    validTimestamp(w.issuedAt);
    validTimestamp(w.expiresAt);
  });
  for (const component of registry.components)
    for (const path of [component.source, ...component.stories]) await containedFile(root, path);
  return { registry, policy, evidence, waivers };
}

export function git(root: string, args: string[]): string {
  const result = Bun.spawnSync(
    [
      "git",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.untrackedCache=false",
      "-c",
      "core.hooksPath=/dev/null",
      "-C",
      root,
      ...args,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    },
  );
  ensure(
    result.exitCode === 0,
    `Git source verification failed: ${result.stderr.toString().trim()}`,
  );
  return result.stdout.toString().trim();
}
export function cleanHead(root: string): string {
  const commit = git(root, ["rev-parse", "--verify", "HEAD"]);
  const entries = git(root, ["ls-files", "-v", "-z"]).split("\0").filter(Boolean);
  ensure(
    !entries.some((entry) => entry.startsWith("S ") || /^[a-z] /.test(entry)),
    "Unsupported hidden Git index flags: assume-unchanged/skip-worktree can conceal source edits",
  );
  ensure(
    git(root, ["status", "--porcelain", "--untracked-files=all"]).length === 0,
    "Dirty/uncommitted repository inputs cannot receive local test-run proof",
  );
  return commit;
}
