import { createHash, randomUUID } from "node:crypto";
import { lstat, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { isAlias, isMap, isScalar, isSeq, parseDocument } from "yaml";
import { decodeRegistry, type Component } from "@governator/core";

type EditorOptions = {
  root: string;
  registryPath: string;
  resolveStory: (
    storyId: string,
  ) => Promise<{ componentId: string; storyPath: string } | undefined>;
};
const allowed = new Set([
  "id",
  "name",
  "package",
  "owners",
  "lifecycle",
  "source",
  "stories",
  "contractVersion",
  "exportPath",
  "packageVersion",
  "replacementId",
  "documentationUrl",
  "figmaUrl",
]);
const revision = (value: string) => createHash("sha256").update(value).digest("hex");
const writes = new Map<string, Promise<void>>();

export async function fileWithin(root: string, path: string): Promise<string> {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").includes("..")
  )
    throw new Error("Unsafe repository path");
  const base = await realpath(root);
  const target = resolve(base, path);
  const rel = relative(base, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error("Path outside repository");
  if ((await realpath(target)) !== target || !(await lstat(target)).isFile())
    throw new Error("Path must be a regular file without symlinks");
  return target;
}
function rejectAliases(node: unknown): void {
  if (isAlias(node)) throw new Error("YAML aliases are unsupported");
  if (isMap(node))
    for (const pair of node.items) {
      rejectAliases(pair.key);
      rejectAliases(pair.value);
    }
  if (isSeq(node)) for (const value of node.items) rejectAliases(value);
}
async function read(options: EditorOptions, storyId: string, componentId: string) {
  const path = await fileWithin(options.root, options.registryPath);
  if ((await lstat(path)).size > 4 * 1024 * 1024) throw new Error("Registry too large");
  const source = await readFile(path, "utf8");
  const doc = parseDocument(source, { uniqueKeys: true, keepSourceTokens: true });
  if (doc.errors.length || doc.warnings.length) throw new Error("Unsupported registry YAML");
  rejectAliases(doc.contents);
  const registry = decodeRegistry(doc.toJS({ maxAliasCount: 0 }));
  for (const entry of registry.components)
    for (const input of [entry.source, ...entry.stories]) await fileWithin(options.root, input);
  const story = await options.resolveStory(storyId);
  const component = registry.components.find((entry) => entry.id === componentId);
  if (
    !component ||
    !story ||
    story.componentId !== componentId ||
    !component.stories.includes(story.storyPath)
  )
    throw new Error("Story does not match registry component");
  return { path, source, doc, registry, component, story, revision: revision(source) };
}
export async function readRegistryEditor(
  options: EditorOptions,
  storyId: string,
  componentId: string,
) {
  const data = await read(options, storyId, componentId);
  return { component: data.component, revision: data.revision };
}
function replacementValue(value: unknown, oldType: string | undefined): string {
  if (typeof value === "string" && oldType === "QUOTE_SINGLE")
    return `'${value.replaceAll("'", "''")}'`;
  return JSON.stringify(value);
}
export async function saveRegistryEditor(
  options: EditorOptions,
  storyId: string,
  componentId: string,
  expected: string,
  fields: Component,
) {
  const path = await fileWithin(options.root, options.registryPath);
  const previous = writes.get(path) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = previous.then(() => gate);
  writes.set(path, current);
  await previous;
  try {
    const data = await read(options, storyId, componentId);
    if (data.revision !== expected) throw new Error("Registry changed; reload before saving");
    if (
      !fields ||
      typeof fields !== "object" ||
      Array.isArray(fields) ||
      Object.keys(fields).some((key) => !allowed.has(key)) ||
      fields.id !== componentId
    )
      throw new Error("Invalid component fields");
    const proposed = {
      ...data.registry,
      components: data.registry.components.map((entry) =>
        entry.id === componentId ? fields : entry,
      ),
    };
    decodeRegistry(proposed);
    for (const entry of proposed.components)
      for (const input of [entry.source, ...entry.stories]) await fileWithin(options.root, input);
    if (!fields.stories.includes(data.story.storyPath))
      throw new Error("Selected story must remain in the registry");
    const components = data.doc.get("components", true);
    if (!isSeq(components)) throw new Error("Unsupported registry structure");
    const node = components.items.find((item) => isMap(item) && item.get("id") === componentId);
    if (!isMap(node)) throw new Error("Unsupported component structure");
    const patches: { start: number; end: number; text: string }[] = [];
    const existing = new Set<string>();
    for (const pair of node.items) {
      if (!isScalar(pair.key) || typeof pair.key.value !== "string" || !allowed.has(pair.key.value))
        throw new Error("Unsupported component field");
      const key = pair.key.value;
      existing.add(key);
      const value = fields[key as keyof Component];
      const old = data.component[key as keyof Component];
      if (JSON.stringify(value) === JSON.stringify(old)) continue;
      if (
        !pair.value ||
        typeof pair.value !== "object" ||
        !("range" in pair.value) ||
        !Array.isArray(pair.value.range)
      )
        throw new Error("Unsupported field value");
      const range = pair.value.range;
      if (value === undefined) {
        if (!pair.key.range || !node.range) throw new Error("Unsupported field range");
        if (node.flow) {
          let end = range[1];
          while (/\s/.test(data.source[end] ?? "")) end++;
          if (data.source[end] === ",") {
            patches.push({ start: pair.key.range[0], end: end + 1, text: "" });
          } else if (data.source[end] === "}") {
            let start = pair.key.range[0] - 1;
            while (/\s/.test(data.source[start] ?? "")) start--;
            if (data.source[start] !== ",") throw new Error("Unsupported flow field removal");
            patches.push({ start, end: range[1], text: "" });
          } else throw new Error("Unsupported flow field removal");
        } else {
          const start = data.source.lastIndexOf("\n", pair.key.range[0] - 1) + 1;
          const end = range[2];
          if (data.source.slice(start, end).includes("#"))
            throw new Error("Cannot remove field containing comments");
          patches.push({ start, end, text: "" });
        }
        continue;
      }
      const raw = data.source.slice(range[0], range[1]);
      if (raw.includes("#") && !isScalar(pair.value))
        throw new Error("Comments in edited values are unsupported");
      patches.push({
        start: range[0],
        end: range[1],
        text: replacementValue(value, isScalar(pair.value) ? pair.value.type : undefined),
      });
    }
    const additions = Object.keys(fields).filter(
      (key) => !existing.has(key) && fields[key as keyof Component] !== undefined,
    );
    if (additions.length) {
      if (!node.range || !node.items.length) throw new Error("Unsupported component structure");
      if (node.flow) {
        const end = node.range[1] - 1;
        if (data.source[end] !== "}") throw new Error("Unsupported flow component");
        const before = data.source.slice(node.range[0], end).trimEnd();
        const prefix = before.endsWith(",") ? " " : ", ";
        patches.push({
          start: end,
          end,
          text:
            prefix +
            additions
              .map(
                (key) =>
                  `${JSON.stringify(key)}: ${JSON.stringify(fields[key as keyof Component])}`,
              )
              .join(", ") +
            ",",
        });
      } else {
        const first = node.items[0]?.key;
        if (!isScalar(first) || !first.range) throw new Error("Unsupported component indentation");
        const line = data.source.slice(
          data.source.lastIndexOf("\n", first.range[0] - 1) + 1,
          first.range[0],
        );
        const indentation = line.endsWith("- ") ? " ".repeat(line.length) : line;
        if (!/^ *$/.test(indentation)) throw new Error("Unsupported component indentation");
        const newline = data.source.includes("\r\n") ? "\r\n" : "\n";
        patches.push({
          start: node.range[1],
          end: node.range[1],
          text: additions
            .map(
              (key) =>
                `${indentation}${key}: ${JSON.stringify(fields[key as keyof Component])}${newline}`,
            )
            .join(""),
        });
      }
    }
    let output = data.source;
    for (const patch of patches.sort((a, b) => b.start - a.start))
      output = output.slice(0, patch.start) + patch.text + output.slice(patch.end);
    const outputDoc = parseDocument(output, { uniqueKeys: true });
    if (outputDoc.errors.length || outputDoc.warnings.length)
      throw new Error("Edited registry is invalid");
    rejectAliases(outputDoc.contents);
    if (
      !isDeepStrictEqual(
        decodeRegistry(outputDoc.toJS({ maxAliasCount: 0 })),
        decodeRegistry(proposed),
      )
    )
      throw new Error("Edited registry does not match requested changes");
    const temp = resolve(dirname(path), `.governator-${randomUUID()}.tmp`);
    const mode = (await lstat(path)).mode & 0o777;
    try {
      const handle = await open(temp, "wx", mode);
      try {
        await handle.chmod(mode);
        await handle.writeFile(output, "utf8");
      } finally {
        await handle.close();
      }
      const again = await read(options, storyId, componentId);
      if (
        again.path !== path ||
        again.revision !== expected ||
        again.story.storyPath !== data.story.storyPath
      )
        throw new Error("Registry or story changed; reload before saving");
      await rename(temp, path);
    } finally {
      await unlink(temp).catch(() => {});
    }
    return { component: fields, revision: revision(output) };
  } finally {
    release();
    if (writes.get(path) === current) writes.delete(path);
  }
}

/** Resolve only an unambiguous server-generated mapping to a canonical repository path. */
export async function resolveMappedStory(
  root: string,
  workingDir: string,
  map: unknown,
  storyId: string,
) {
  if (
    !map ||
    typeof map !== "object" ||
    !("version" in map) ||
    map.version !== 1 ||
    !("stories" in map) ||
    !Array.isArray(map.stories) ||
    map.stories.length > 100_000
  )
    return undefined;
  const entries = map.stories.filter(
    (entry: unknown) => entry && typeof entry === "object" && "id" in entry && entry.id === storyId,
  );
  if (entries.length !== 1) return undefined;
  const entry: unknown = entries[0];
  if (
    !entry ||
    typeof entry !== "object" ||
    !("componentId" in entry) ||
    typeof entry.componentId !== "string" ||
    !("importPath" in entry) ||
    typeof entry.importPath !== "string" ||
    !("exportName" in entry) ||
    typeof entry.exportName !== "string"
  )
    return undefined;
  const base = await realpath(root);
  const working = await realpath(workingDir);
  const path = relative(base, resolve(working, entry.importPath)).split(sep).join("/");
  try {
    await fileWithin(base, path);
  } catch {
    return undefined;
  }
  return { componentId: entry.componentId, storyPath: path };
}
