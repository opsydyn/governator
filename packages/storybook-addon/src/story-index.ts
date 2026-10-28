import { loadCsf } from "storybook/internal/csf-tools";
import { readFile } from "node:fs/promises";
import type { Indexer } from "storybook/internal/types";

export const componentTagPrefix = "governator:component:";

export function wrapIndexers(indexers: Indexer[]): Indexer[] {
  return indexers.map((indexer) => ({
    ...indexer,
    async createIndex(fileName, options) {
      const entries = await indexer.createIndex(fileName, options);
      let identities: Record<string, string> = Object.create(null);
      if (/\.(?:stories|story)\.[cm]?[jt]sx?$/.test(fileName)) {
        try {
          identities = identitiesFromCsf(
            await readFile(fileName, "utf8"),
            fileName,
            entries.map((entry) => entry.exportName),
          );
        } catch {
          /* Missing or unsupported sources stay unlinked. */
        }
      }
      return entries.map((entry) => {
        const tags = (entry.tags ?? []).filter((tag) => !tag.startsWith("governator:"));
        tags.push("governator:indexed");
        const identity = Object.hasOwn(identities, entry.exportName)
          ? identities[entry.exportName]
          : undefined;
        let mapped = false;
        if (identity) {
          try {
            tags.push(`${componentTagPrefix}${encodeURIComponent(identity)}`);
            mapped = true;
          } catch {
            /* Malformed Unicode stays unlinked. */
          }
        }
        if (!mapped) tags.push("governator:unmapped");
        return { ...entry, tags };
      });
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
      if (["CallExpression", "OptionalCallExpression", "NewExpression"].includes(String(item.type)))
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
      if (declaration?.type !== "VariableDeclarator") continue;
      const story = unwrap(declaration.init);
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
