/* oxlint-disable linteffect/no-node-platform-in-shared-code, linteffect/no-try-catch, linteffect/no-return-in-arrow, linteffect/no-naked-object-state-update, linteffect/no-string-sentinel-const -- Shared filesystem authoring boundary; preserves YAML and checks revisions before single-file replacement. */
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, open, rename, unlink } from "node:fs/promises";
import { dirname, resolve, relative, sep, isAbsolute } from "node:path";
import { isSeq, parseDocument } from "yaml";
import { decodeRegistry, decodeTestMap, ensure, decode, Component } from "@governator/core";
import { fileWithin } from "./registry.ts";

export type EditPlan = { path: string; revision: string; before: string; after: string };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function document(root: string, path: string) {
  const target = await fileWithin(root, path);
  ensure((await lstat(target)).size <= 4 * 1024 * 1024, "Input exceeds 4 MiB");
  const source = await readFile(target, "utf8");
  const doc = parseDocument(source, { uniqueKeys: true, keepSourceTokens: true });
  ensure(!doc.errors.length && !doc.warnings.length, "Unsupported YAML");
  const value = doc.toJS({ maxAliasCount: 0 });
  return { target, source, doc, value };
}
export async function planRegistration(
  root: string,
  path: string,
  fields: unknown,
): Promise<EditPlan> {
  const data = await document(root, path);
  const registry = decodeRegistry(data.value);
  const component = decode(Component, fields);
  ensure(
    !registry.components.some((item) => item.id === component.id),
    "Component ID already registered",
  );
  decodeRegistry({ ...registry, components: [...registry.components, component] });
  for (const input of [component.source, ...component.stories]) await fileWithin(root, input);
  const list = data.doc.get("components", true);
  ensure(isSeq(list), "Expected component sequence");
  list.add(data.doc.createNode(fields));
  const after = String(data.doc);
  decodeRegistry(parseDocument(after).toJS({ maxAliasCount: 0 }));
  return { path, revision: hash(data.source), before: data.source, after };
}
export async function planMapping(
  root: string,
  path: string,
  registryPath: string,
  componentId: string,
  files: unknown,
): Promise<EditPlan> {
  const data = await document(root, path);
  const registry = decodeRegistry((await document(root, registryPath)).value);
  const mapping = decodeTestMap(data.value, registry);
  ensure(
    Array.isArray(files) && files.every((file) => typeof file === "string"),
    "Provide a JSON array of test paths",
  );
  for (const file of files) await fileWithin(root, file);
  const mappings = mapping.mappings.filter((item) => item.componentId !== componentId);
  const proposed = { ...mapping, mappings: [...mappings, { componentId, files }] };
  decodeTestMap(proposed, registry);
  // The evidence runner consumes mappings with JSON.parse, so retain JSON syntax.
  const after = JSON.stringify(proposed, null, 2) + "\n";
  decodeTestMap(parseDocument(after).toJS({ maxAliasCount: 0 }), registry);
  return { path, revision: hash(data.source), before: data.source, after };
}
/** Recompute the plan at application time. Revision protects against prior edits, not hostile concurrent processes. */
export async function applyPlan(root: string, plan: EditPlan, expected: string) {
  ensure(
    /^[a-f0-9]{64}$/.test(expected) && expected === plan.revision,
    "Revision conflict; inspect a fresh plan",
  );
  const target = await fileWithin(root, plan.path);
  const temporary = resolve(dirname(target), `.governator-${randomUUID()}.tmp`);
  const rel = relative(root, target);
  ensure(
    !!rel && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`),
    "Target outside root",
  );
  const handle = await open(temporary, "wx", (await lstat(target)).mode & 0o777);
  try {
    await handle.chmod((await lstat(target)).mode & 0o777);
    await handle.writeFile(plan.after, "utf8");
    await handle.close();
    ensure(
      hash(await readFile(await fileWithin(root, plan.path), "utf8")) === expected,
      "Revision changed; inspect a fresh plan",
    );
    await rename(temporary, target);
  } finally {
    await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
  return { path: plan.path, revision: hash(plan.after), changed: plan.before !== plan.after };
}
