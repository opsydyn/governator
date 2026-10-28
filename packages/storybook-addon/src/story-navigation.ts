export type StoryLink = { id: string; name: string };

export async function loadStoryMap(
  base: string,
  origin: string,
  fetcher: (url: string, options: RequestInit) => Promise<Response> = fetch,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    const url = new URL("./governator-story-map.json", base);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== origin ||
      url.username ||
      url.password
    )
      return undefined;
    const response = await fetcher(url.href, {
      ...(signal ? { signal } : {}),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Join explicit source mappings only to matching local stories in the current index. */
export function storiesByComponent(
  index: Record<string, unknown> | undefined,
  mapping: unknown,
): Record<string, StoryLink[]> {
  const result: Record<string, StoryLink[]> = Object.create(null);
  if (
    !mapping ||
    typeof mapping !== "object" ||
    !("version" in mapping) ||
    mapping.version !== 1 ||
    !("stories" in mapping) ||
    !Array.isArray(mapping.stories) ||
    mapping.stories.length > 100_000
  )
    return result;
  const seen = new Set<string>();
  for (const raw of mapping.stories) {
    if (!raw || typeof raw !== "object") return Object.create(null);
    const item = raw as Record<string, unknown>;
    if (
      ["id", "componentId", "importPath", "exportName"].some(
        (key) => typeof item[key] !== "string" || !(item[key] as string).length,
      )
    )
      return Object.create(null);
    const { id, componentId, importPath, exportName } = item as {
      id: string;
      componentId: string;
      importPath: string;
      exportName: string;
    };
    if (seen.has(id)) return Object.create(null);
    seen.add(id);
    if (!index || !Object.hasOwn(index, id)) continue;
    const entry = index[id];
    if (!entry || typeof entry !== "object") continue;
    const story = entry as Record<string, unknown>;
    if (
      story.type !== "story" ||
      story.subtype === "test" ||
      story.refId ||
      story.id !== id ||
      story.importPath !== importPath ||
      story.exportName !== exportName ||
      typeof story.name !== "string" ||
      typeof story.title !== "string"
    )
      continue;
    (result[componentId] ??= []).push({ id, name: `${story.title} / ${story.name}` });
  }
  return result;
}
