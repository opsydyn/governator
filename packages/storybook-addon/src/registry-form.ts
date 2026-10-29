export type RegistryFields = Record<string, unknown> & { id: string };
export type RegistryValues = Record<string, string>;

export const registryFields = [
  ["name", "Name", "basic"],
  ["package", "Package", "basic"],
  ["lifecycle", "Lifecycle", "basic"],
  ["owners", "Owners, one per line", "ownership"],
  ["source", "Source path", "contracts"],
  ["stories", "Story paths, one per line", "contracts"],
  ["contractVersion", "Contract version", "contracts"],
  ["exportPath", "Export path", "contracts"],
  ["packageVersion", "Package version (optional)", "contracts"],
  ["replacementId", "Replacement ID (optional)", "contracts"],
  ["documentationUrl", "Documentation URL (optional)", "links"],
  ["figmaUrl", "Figma URL (optional)", "links"],
] as const;

export const registryArrays = new Set<string>(["owners", "stories"]);
const optional = new Set(["packageVersion", "replacementId", "documentationUrl", "figmaUrl"]);
const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[\da-zA-Z-]*[a-zA-Z-][\da-zA-Z-]*)(?:\.(?:0|[1-9]\d*|[\da-zA-Z-]*[a-zA-Z-][\da-zA-Z-]*))*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/;
const componentId = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

export function valuesOfRegistryComponent(component: RegistryFields): RegistryValues {
  return Object.fromEntries(
    registryFields.map(([key]) => [
      key,
      registryArrays.has(key) && Array.isArray(component[key])
        ? (component[key] as string[]).join("\n")
        : typeof component[key] === "string"
          ? component[key]
          : "",
    ]),
  );
}

function relativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.split("/").includes("..")
  );
}

function webUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function buildRegistryComponent(
  original: RegistryFields,
  values: RegistryValues,
): { values: RegistryValues; fieldErrors: Record<string, string>; component?: RegistryFields } {
  const fieldErrors: Record<string, string> = {};
  const lines = (name: string) =>
    (values[name] ?? "")
      .split("\n")
      .map((part) => part.trim())
      .filter(Boolean);
  const versionMessage = "Use a complete semantic version such as 1.2.3 or 1.2.3-rc.1.";
  if (!semver.test(values.contractVersion ?? "")) fieldErrors.contractVersion = versionMessage;
  if (values.packageVersion && !semver.test(values.packageVersion))
    fieldErrors.packageVersion = versionMessage;
  if (!lines("owners").length) fieldErrors.owners = "Add at least one owner, one per line.";
  if (!relativePath(values.source ?? ""))
    fieldErrors.source = "Use a repository-relative path without dot-dot segments or backslashes.";
  if (!lines("stories").length || lines("stories").some((path) => !relativePath(path)))
    fieldErrors.stories = "Use repository-relative paths without dot-dot segments or backslashes.";
  for (const field of ["documentationUrl", "figmaUrl"])
    if (values[field] && !webUrl(values[field]))
      fieldErrors[field] = "Use an absolute HTTP or HTTPS URL.";
  if (values.replacementId && !componentId.test(values.replacementId))
    fieldErrors.replacementId = "Use a dotted component ID such as ui.button.";
  for (const field of ["name", "package", "exportPath"])
    if (!(values[field] ?? "").trim()) fieldErrors[field] = "This field is required.";
  if (Object.keys(fieldErrors).length) return { values, fieldErrors };

  const component: RegistryFields = { ...original };
  const originalValues = valuesOfRegistryComponent(original);
  for (const [name] of registryFields) {
    const text = values[name] ?? "";
    if (text === originalValues[name]) continue;
    if (registryArrays.has(name)) component[name] = lines(name);
    else if (optional.has(name) && !text.trim()) {
      if (original[name] !== null) delete component[name];
    } else component[name] = text.trim();
  }
  return { values, fieldErrors, component };
}
