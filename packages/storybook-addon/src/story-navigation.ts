export type StoryLink = { id: string; name: string };

/** Read only unambiguous mappings for local stories from Storybook's source index. */
export function storiesByComponent(
  index: Record<string, unknown> | undefined,
): Record<string, StoryLink[]> {
  const result: Record<string, StoryLink[]> = Object.create(null);
  for (const entry of Object.values(index ?? {})) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (
      item.type !== "story" ||
      item.refId ||
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      typeof item.title !== "string" ||
      !Array.isArray(item.tags)
    )
      continue;
    if (!item.tags.includes("governator:indexed") || item.tags.includes("governator:unmapped"))
      continue;
    const tags = item.tags.filter(
      (tag): tag is string => typeof tag === "string" && tag.startsWith("governator:component:"),
    );
    if (tags.length !== 1) continue;
    try {
      const id = decodeURIComponent(tags[0]!.slice("governator:component:".length));
      if (!id) continue;
      (result[id] ??= []).push({ id: item.id, name: `${item.title} / ${item.name}` });
    } catch {
      /* Invalid markers do not produce a navigation link. */
    }
  }
  return result;
}
