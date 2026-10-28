import { loadCsf } from "storybook/internal/csf-tools";

const reserved = new Set(["dev", "test", "autodocs", "manifest", "play-fn", "test-fn"]);
const isProtected = (tag: string) =>
  tag.startsWith("!") || tag.startsWith("governator:") || reserved.has(tag);

/** Edit only literal component metadata; unsupported forms fail without rewriting the file. */
export function editComponentTags(
  source: string,
  fileName: string,
  tags: readonly string[],
): string {
  if (
    tags.length > 50 ||
    new Set(tags).size !== tags.length ||
    tags.some((tag) => !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,63}$/.test(tag) || isProtected(tag))
  )
    throw new Error("Invalid or reserved descriptive tag");
  const csf = loadCsf(source, { fileName, makeTitle: (title) => title ?? "" }).parse();
  const checked = (output: string) => {
    loadCsf(output, { fileName, makeTitle: (title) => title ?? "" }).parse();
    return output;
  };
  const meta = csf._metaNode;
  if (
    !meta ||
    meta.end == null ||
    meta.properties.some((property) => property.type !== "ObjectProperty" || property.computed)
  )
    throw new Error("Component metadata must be a static object");
  const properties = meta.properties.filter(
    (property) =>
      property.type === "ObjectProperty" &&
      ((property.key.type === "Identifier" && property.key.name === "tags") ||
        (property.key.type === "StringLiteral" && property.key.value === "tags")),
  );
  if (properties.length > 1) throw new Error("Multiple tag declarations are not editable");
  const array = properties[0]?.type === "ObjectProperty" ? properties[0].value : undefined;
  if (
    array &&
    (array.type !== "ArrayExpression" ||
      array.elements.some((element) => element?.type !== "StringLiteral"))
  )
    throw new Error("Component tags must be a static array of strings");
  const existing =
    array?.type === "ArrayExpression"
      ? array.elements.map((element) => (element!.type === "StringLiteral" ? element!.value : ""))
      : [];
  const fixed = existing.filter(isProtected);
  const next = `[${[...fixed, ...tags].map((tag) => JSON.stringify(tag)).join(", ")}]`;
  if (array) {
    if (
      array.start == null ||
      array.end == null ||
      /\/\*|\/\//.test(source.slice(array.start, array.end))
    )
      throw new Error("Cannot safely edit tags containing comments");
    return checked(source.slice(0, array.start) + next + source.slice(array.end));
  }
  const lastProperty = meta.properties.at(-1);
  if (lastProperty?.end != null && /\/\*|\/\//.test(source.slice(lastProperty.end, meta.end - 1)))
    throw new Error("Cannot safely insert tags after a comment");
  const before = source.slice(0, meta.end - 1);
  const comma = meta.properties.length && !before.trimEnd().endsWith(",") ? "," : "";
  return checked(`${before}${comma} tags: ${next} ${source.slice(meta.end - 1)}`);
}
