/* oxlint-disable linteffect/no-if-statement, linteffect/no-try-catch, linteffect/no-return-in-arrow, linteffect/no-string-sentinel-const, linteffect/no-naked-object-state-update, linteffect/no-boundary-try-catch-without-effect-map -- Local onboarding IO boundary, called through the mapped CLI Effect runtime. */
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { decodeRegistry, decodePolicy, decodeTestMap, digest, ensure } from "@governator/core";
import { containedFile } from "./files.ts";
import type { CliResult } from "./commands.ts";
const jsonResult = (value: unknown): CliResult => ({
  code: 0,
  stdout: JSON.stringify(value, null, 2) + "\n",
  stderr: "",
});
export async function absent(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    ensure((error as NodeJS.ErrnoException).code === "ENOENT", "Cannot inspect destination");
    return true;
  }
}
function relativePath(path: string) {
  ensure(
    path.length > 0 &&
      !isAbsolute(path) &&
      !path.includes("\\") &&
      !path.includes("\0") &&
      path.split("/").every((part) => part !== ".." && part !== "." && part !== ""),
    "Use a canonical contained relative destination",
  );
}
/** Check each existing directory before creating any missing directories. */
export async function directory(root: string, path: string, create: boolean) {
  relativePath(path);
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    if (await absent(current)) {
      if (create) await mkdir(current);
    } else
      ensure(
        (await lstat(current)).isDirectory() && (await realpath(current)) === current,
        "Destination parents must be real directories without symlinks",
      );
  }
}
export async function runInit(command: string, values: Map<string, string>): Promise<CliResult> {
  const root = await realpath(resolve(values.get("--root") ?? "."));
  const config = await containedFile(root, values.get("--config") ?? "");
  ensure((await lstat(config)).size <= 4 * 1024 * 1024, "Setup input exceeds 4 MiB");
  const raw = JSON.parse(await readFile(config, "utf8"));
  ensure(
    raw &&
      typeof raw === "object" &&
      Object.keys(raw).every((key) => ["registry", "policy", "mapping"].includes(key)),
    "Setup accepts registry, policy and mapping only",
  );
  const registry = decodeRegistry(raw.registry);
  const policy = decodePolicy(raw.policy);
  const mapping = decodeTestMap(raw.mapping, registry);
  for (const entry of registry.components)
    ensure(entry.owners.length > 0, "Setup requires an explicit owner for each component");
  for (const entry of registry.components)
    for (const path of [entry.source, ...entry.stories]) await containedFile(root, path);
  for (const entry of mapping.mappings)
    for (const path of entry.files) await containedFile(root, path);
  await directory(root, "governance", false);
  const files = [
    { path: "governance/components.yaml", content: JSON.stringify(registry, null, 2) + "\n" },
    { path: "governance/policy.yaml", content: JSON.stringify(policy, null, 2) + "\n" },
    { path: "governance/tests.json", content: JSON.stringify(mapping, null, 2) + "\n" },
  ];
  for (const file of files)
    ensure(await absent(join(root, file.path)), `Destination already exists: ${file.path}`);
  const revision = digest({ schemaVersion: 1, root, files });
  const nextActions = [
    "Review the generated configuration and policy scope",
    "Ensure artifacts/ is ignored by Git",
    "Review and commit source before executing configured producers",
  ];
  if (command === "init.plan")
    return jsonResult({ schemaVersion: 1, root, revision, files, effects: [], nextActions });
  ensure(values.get("--revision") === revision, "Setup plan changed; review a fresh plan");
  await directory(root, "governance", true);
  for (const file of files) await writeFile(join(root, file.path), file.content, { flag: "wx" });
  return jsonResult({
    schemaVersion: 1,
    revision,
    created: files.map((file) => file.path),
    evidenceProduced: false,
    nextActions,
  });
}

const skillFiles = ["SKILL.md", "references/setup.md"];
export async function runSkillExport(values: Map<string, string>): Promise<CliResult> {
  const root = await realpath(resolve(values.get("--root") ?? "."));
  const out = values.get("--out") ?? "";
  relativePath(out);
  const target = resolve(root, out);
  const rel = relative(root, target);
  ensure(
    !!rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel),
    "Skill destination must be below the selected root",
  );
  ensure(await absent(target), "Skill destination already exists; choose a new directory");
  const parent = relative(root, dirname(target)).split(sep).join("/");
  if (parent) await directory(root, parent, false);
  // Source execution reads repository skill files; packed execution reads only bundled assets.
  const source = import.meta.dirname.endsWith(`${sep}src`)
    ? resolve(import.meta.dirname, "../../../skills/governator-onboarding")
    : join(import.meta.dirname, "skills/governator-onboarding");
  const files = [];
  for (const path of skillFiles) {
    const file = join(source, path);
    const info = await lstat(file);
    ensure(
      info.isFile() && !info.isSymbolicLink() && info.size <= 256 * 1024,
      "Invalid bundled skill file",
    );
    files.push({ path, content: await readFile(file, "utf8") });
  }
  if (parent) await directory(root, parent, true);
  await mkdir(target);
  await mkdir(join(target, "references"));
  for (const file of files) await writeFile(join(target, file.path), file.content, { flag: "wx" });
  return jsonResult({
    schemaVersion: 1,
    path: out,
    files: skillFiles,
    activated: false,
    nextAction:
      "Use your selected agent client's skill discovery instructions; no client settings were changed",
  });
}
