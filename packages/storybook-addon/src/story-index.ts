import { loadCsf } from "storybook/internal/csf-tools";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { Indexer } from "storybook/internal/types";

type Snapshot = { source: string; identities: Record<string, string> };
const snapshots = new Map<string, Snapshot>();
const generations = new Map<string, number>();
let revision = 0;

export type StoryMap = {
  version: 1;
  stories: { id: string; componentId: string; importPath: string; exportName: string }[];
};

/** Join source snapshots to Storybook's current canonical index; never manufacture story IDs. */
export async function storyMapFromIndex(index: unknown, workingDir: string): Promise<StoryMap> {
  const result: StoryMap = { version: 1, stories: [] };
  const started = revision;
  if (!index || typeof index !== "object" || !("entries" in index)) return result;
  const entries = index.entries;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) return result;
  const candidates: {
    id: string;
    componentId: string;
    importPath: string;
    exportName: string;
    fileName: string;
    snapshot: Snapshot;
  }[] = [];
  for (const [key, raw] of Object.entries(entries)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (
      entry.type !== "story" ||
      (entry.subtype !== undefined && entry.subtype !== "story") ||
      typeof entry.id !== "string" ||
      entry.id !== key ||
      typeof entry.importPath !== "string" ||
      entry.importPath.startsWith("virtual:") ||
      typeof entry.exportName !== "string"
    )
      continue;
    const fileName = resolve(workingDir, entry.importPath);
    const snapshot = snapshots.get(fileName);
    if (!snapshot || !Object.hasOwn(snapshot.identities, entry.exportName)) continue;
    const componentId = snapshot.identities[entry.exportName];
    if (typeof componentId !== "string" || !componentId) continue;
    candidates.push({
      id: entry.id,
      componentId,
      importPath: entry.importPath,
      exportName: entry.exportName,
      fileName,
      snapshot,
    });
  }
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const key = JSON.stringify([candidate.fileName, candidate.exportName]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const verified = new Map<string, boolean>();
  for (const candidate of candidates) {
    const key = JSON.stringify([candidate.fileName, candidate.exportName]);
    if (counts.get(key) !== 1) continue;
    if (!verified.has(candidate.fileName)) {
      try {
        verified.set(
          candidate.fileName,
          (await readFile(candidate.fileName, "utf8")) === candidate.snapshot.source,
        );
      } catch {
        verified.set(candidate.fileName, false);
      }
    }
    if (verified.get(candidate.fileName)) {
      const { id, componentId, importPath, exportName } = candidate;
      result.stories.push({ id, componentId, importPath, exportName });
    }
  }
  return started === revision ? result : { version: 1, stories: [] };
}

export function wrapIndexers(indexers: Indexer[]): Indexer[] {
  return indexers.map((indexer) => ({
    ...indexer,
    async createIndex(fileName, options) {
      const path = resolve(fileName);
      const generation = (generations.get(path) ?? 0) + 1;
      generations.set(path, generation);
      snapshots.delete(path);
      revision++;
      let before: string | undefined;
      let beforeStat: Awaited<ReturnType<typeof stat>> | undefined;
      if (/\.(?:stories|story)\.[cm]?[jt]sx?$/.test(fileName)) {
        try {
          beforeStat = await stat(path);
          before = await readFile(path, "utf8");
        } catch {
          /* Unsupported source remains unmapped. */
        }
      }
      const entries = await indexer.createIndex(fileName, options);
      if (before !== undefined) {
        try {
          const after = await readFile(path, "utf8");
          const afterStat = await stat(path);
          if (
            before === after &&
            beforeStat &&
            beforeStat.ino === afterStat.ino &&
            beforeStat.size === afterStat.size &&
            beforeStat.mtimeMs === afterStat.mtimeMs &&
            beforeStat.ctimeMs === afterStat.ctimeMs &&
            generations.get(path) === generation
          ) {
            const counts = new Map<string, number>();
            for (const entry of entries)
              counts.set(entry.exportName, (counts.get(entry.exportName) ?? 0) + 1);
            const names = entries
              .filter((entry) => entry.type === "story" && counts.get(entry.exportName) === 1)
              .map((entry) => entry.exportName);
            snapshots.set(path, {
              source: after,
              identities: identitiesFromCsf(after, fileName, names),
            });
          }
        } catch {
          /* Source changed or disappeared; do not publish a mapping. */
        }
      }
      revision++;
      return entries;
    },
  }));
}

type Node = { type: string; [key: string]: unknown };
const node = (value: unknown): Node | undefined =>
  value && typeof value === "object" && "type" in value && typeof value.type === "string"
    ? (value as Node)
    : undefined;
const unwrap = (value: unknown): Node | undefined => {
  const result = node(value);
  return result &&
    ["TSAsExpression", "TSSatisfiesExpression", "TypeCastExpression"].includes(result.type)
    ? unwrap(result.expression)
    : result;
};
// undefined means absent; null means dynamic or ambiguous.
function property(value: unknown, key: string): unknown {
  const object = unwrap(value);
  if (!object || object.type !== "ObjectExpression" || !Array.isArray(object.properties))
    return null;
  let found: unknown = undefined;
  for (const raw of object.properties) {
    const prop = node(raw);
    const propKey = node(prop?.key);
    if (!prop || prop.type !== "ObjectProperty" || prop.computed || !propKey) return null;
    const name =
      propKey.type === "Identifier"
        ? propKey.name
        : propKey.type === "StringLiteral"
          ? propKey.value
          : null;
    if (name === null) return null;
    if (name === key) {
      if (found !== undefined) return null;
      found = prop.value;
    }
  }
  return found;
}
function identity(parameters: unknown): string | null | undefined {
  if (parameters === undefined) return undefined;
  const governance = property(parameters, "governance");
  if (governance === undefined) return undefined;
  const component = property(governance, "componentId");
  if (component === undefined) return undefined;
  const literal = unwrap(component);
  return literal?.type === "StringLiteral" &&
    typeof literal.value === "string" &&
    literal.value.length > 0
    ? literal.value
    : null;
}

/** Only index statically declared CSF metadata; unsupported forms produce no identity. */
export function identitiesFromCsf(
  source: string,
  fileName: string,
  exports: readonly string[],
): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  try {
    const csf = loadCsf(source, { fileName, makeTitle: (title) => title ?? "" }).parse();
    const hasEagerCall = (value: unknown): boolean => {
      if (!value || typeof value !== "object") return false;
      if (Array.isArray(value)) return value.some(hasEagerCall);
      const item = value as Record<string, unknown>;
      if (
        ["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"].includes(
          String(item.type),
        )
      )
        return false;
      if (
        [
          "CallExpression",
          "OptionalCallExpression",
          "NewExpression",
          "TaggedTemplateExpression",
          "AwaitExpression",
          "ImportExpression",
        ].includes(String(item.type))
      )
        return true;
      return Object.entries(item).some(
        ([key, child]) => !["loc", "tokens", "comments"].includes(key) && hasEagerCall(child),
      );
    };
    if (csf._ast.program.body.some(hasEagerCall)) return result;
    // Assignments can mutate metadata or exported stories after the indexed declaration.
    // Refuse the file rather than claiming a potentially obsolete identity.
    let mutated = false;
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object" || mutated) return;
      if (Array.isArray(value)) {
        for (const child of value) visit(child);
        return;
      }
      const item = value as Record<string, unknown>;
      if (item.type === "AssignmentExpression" || item.type === "UpdateExpression") {
        mutated = true;
        return;
      }
      for (const [key, child] of Object.entries(item))
        if (!["loc", "tokens", "comments"].includes(key)) visit(child);
    };
    visit(csf._ast.program);
    if (mutated) return result;
    const base = identity(property(csf._metaNode, "parameters"));
    for (const name of exports) {
      const declaration = csf._storyExports[name];
      if (declaration?.type === "FunctionDeclaration") {
        if (typeof base === "string") result[name] = base;
        continue;
      }
      if (declaration?.type !== "VariableDeclarator") continue;
      const story = unwrap(declaration.init);
      if (story?.type === "ArrowFunctionExpression" || story?.type === "FunctionExpression") {
        if (typeof base === "string") result[name] = base;
        continue;
      }
      if (story?.type !== "ObjectExpression") continue;
      const params = property(story, "parameters");
      const own = identity(params);
      const selected = own === undefined ? base : own;
      if (typeof selected === "string") result[name] = selected;
    }
  } catch {
    /* Unsupported CSF is left unmapped. */
  }
  return result;
}
