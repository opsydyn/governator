import { storiesByComponent } from "./story-navigation.ts";
import type { GovernanceReport } from "@governator/protocol";

export type ReadinessFilter = "all" | "attention" | "blocked" | "insufficient_evidence" | "ready";
type Decision = Pick<GovernanceReport["decisions"][number], "componentId" | "gate">;
type Item = { id: string; type: string };
type Predicate = (item: Item) => boolean;

/** Ignore index object churn caused by Storybook applying filters. */
export function storyIndexSignature(index: Record<string, unknown> | undefined): string {
  if (!index) return "";
  const entries = Object.values(index).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (item.type !== "story" && item.type !== "docs") return [];
    return [
      [item.id, item.type, item.subtype, item.importPath, item.exportName, item.title, item.name],
    ];
  });
  return JSON.stringify(entries.sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

/** Reindex sequentially while each installed predicate always reads the latest selection. */
export class ReadinessFilterController {
  private target: Predicate = () => true;
  private pending: Promise<void> = Promise.resolve();
  private readonly active: Predicate = (item) => this.target(item);
  constructor(private readonly apply: (predicate: Predicate) => Promise<void>) {}
  set(predicate: Predicate): Promise<void> {
    this.target = predicate;
    this.pending = this.pending.catch(() => {}).then(() => this.apply(this.active));
    return this.pending;
  }
}

/** Filter only source-mapped local stories; unknown or ambiguous entries stay visible. */
export function createReadinessFilter(
  mode: ReadinessFilter,
  index: Record<string, unknown>,
  mapping: unknown,
  decisions: readonly Decision[],
): (item: Item) => boolean {
  const gates = new Map(decisions.map((decision) => [decision.componentId, decision.gate]));
  const storyGates = new Map<string, Decision["gate"]>();
  const storyComponents = new Map<string, string>();
  for (const [componentId, stories] of Object.entries(storiesByComponent(index, mapping))) {
    const gate = gates.get(componentId);
    if (!gate) continue;
    for (const story of stories) {
      storyGates.set(story.id, gate);
      storyComponents.set(story.id, componentId);
    }
  }
  const byPath = new Map<string, { total: number; mapped: number; components: Set<string> }>();
  for (const entry of Object.values(index)) {
    if (!entry || typeof entry !== "object") continue;
    const story = entry as Record<string, unknown>;
    if (
      story.type !== "story" ||
      story.subtype === "test" ||
      typeof story.importPath !== "string" ||
      typeof story.id !== "string"
    )
      continue;
    const info = byPath.get(story.importPath) ?? {
      total: 0,
      mapped: 0,
      components: new Set<string>(),
    };
    info.total++;
    const component = storyComponents.get(story.id);
    if (component) {
      info.mapped++;
      info.components.add(component);
    }
    byPath.set(story.importPath, info);
  }
  for (const entry of Object.values(index)) {
    if (!entry || typeof entry !== "object") continue;
    const docs = entry as Record<string, unknown>;
    if (docs.type !== "docs" || typeof docs.importPath !== "string" || typeof docs.id !== "string")
      continue;
    const info = byPath.get(docs.importPath);
    if (info && info.total === info.mapped && info.components.size === 1) {
      const gate = gates.get([...info.components][0]!);
      if (gate) storyGates.set(docs.id, gate);
    }
  }
  return (item) => {
    const gate = storyGates.get(item.id);
    return mode === "all" || !gate || (mode === "attention" ? gate !== "ready" : gate === mode);
  };
}
