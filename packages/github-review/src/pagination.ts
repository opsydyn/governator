import { requireCondition, reviewLimits } from "./domain.ts";

export function pageUrl(pullUrl: string, page: number): string {
  return `${pullUrl}/reviews?per_page=100&page=${page}`;
}

function linkPage(raw: string, pullUrl: string): number {
  // Check raw spelling before URL normalization can erase traversal, escapes or credentials.
  const prefix = `${pullUrl}/reviews?`;
  requireCondition(raw.startsWith(prefix), "invalid_pagination");
  const query = raw.slice(prefix.length);
  requireCondition(
    /^(?:per_page=100&page=[1-9]\d*|page=[1-9]\d*&per_page=100)$/.test(query),
    "invalid_pagination",
  );
  const url = new URL(raw);
  const page = Number(url.searchParams.get("page"));
  requireCondition(Number.isSafeInteger(page) && page > 0, "invalid_pagination");
  return page;
}

export function nextPage(link: string | null, pullUrl: string, current: number): number | null {
  if (link === null) return null;
  requireCondition(
    typeof link === "string" && link.length > 0 && link.length <= reviewLimits.linkBytes,
    "invalid_pagination",
  );
  const entries = link.split(",");
  requireCondition(entries.length <= 4, "invalid_pagination");
  const relations = new Map<string, number>();
  for (const entry of entries) {
    const match = /^\s*<([^<>]+)>;\s*rel="(next|prev|first|last)"\s*$/.exec(entry);
    requireCondition(match?.[1] && match[2], "invalid_pagination");
    const relation = match[2];
    requireCondition(!relations.has(relation), "invalid_pagination");
    relations.set(relation, linkPage(match[1], pullUrl));
  }
  const next = relations.get("next");
  const last = relations.get("last");
  const first = relations.get("first");
  const prev = relations.get("prev");
  requireCondition(next === undefined || next === current + 1, "invalid_pagination");
  requireCondition(
    last === undefined || (last >= current && (next !== undefined || last === current)),
    "invalid_pagination",
  );
  requireCondition(first === undefined || first === 1, "invalid_pagination");
  requireCondition(prev === undefined || prev === current - 1, "invalid_pagination");
  requireCondition(next === undefined || last === undefined || next <= last, "invalid_pagination");
  return next ?? null;
}
