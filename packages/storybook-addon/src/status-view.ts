import type { GovernanceReport } from "@governator/protocol";
import { storiesByComponent } from "./story-navigation.ts";

type Decision = GovernanceReport["decisions"][number];
type Gate = Decision["gate"];

export type ReadinessView = {
  label: string;
  tone: "success" | "danger" | "warning";
  description: string;
};

export function readinessView(gate: Gate): ReadinessView {
  if (gate === "ready")
    return {
      label: "Ready",
      tone: "success",
      description: "Required readiness evidence is complete.",
    };
  if (gate === "blocked")
    return {
      label: "Blocked",
      tone: "danger",
      description: "At least one readiness check blocks use.",
    };
  return {
    label: "Missing evidence",
    tone: "warning",
    description: "Required readiness evidence is incomplete.",
  };
}

function storyComponents(
  index: Record<string, unknown> | undefined,
  mapping: unknown,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const [componentId, stories] of Object.entries(storiesByComponent(index, mapping)))
    for (const story of stories) result.set(story.id, componentId);
  return result;
}

export function componentStatusForStory(
  storyId: string,
  index: Record<string, unknown> | undefined,
  mapping: unknown,
  report: GovernanceReport,
): Decision | undefined {
  const componentId = storyComponents(index, mapping).get(storyId);
  return componentId
    ? report.decisions.find((decision) => decision.componentId === componentId)
    : undefined;
}

export type SelectedReportStatus = {
  reportUrl: string | undefined;
  verifySource: boolean;
  report: GovernanceReport | undefined;
  index: Record<string, unknown> | undefined;
  mapping: unknown;
};

type SidebarItem = { id: string; type: string; children?: readonly unknown[] };
export type SidebarStatus =
  | { kind: "decision"; componentId: string; decision: Decision }
  | { kind: "mixed" }
  | { kind: "unknown" };

function itemStoryIds(
  item: SidebarItem,
  selected: SelectedReportStatus,
  components: Map<string, string>,
): string[] {
  if (item.type === "story") return [item.id];
  if (item.type === "component")
    return (item.children ?? []).flatMap((child) => {
      if (typeof child === "string") return [child];
      if (child && typeof child === "object" && "id" in child && typeof child.id === "string")
        return [child.id];
      return [];
    });
  if (item.type !== "docs") return [];
  const raw = selected.index?.[item.id];
  if (!raw || typeof raw !== "object" || !("importPath" in raw)) return [];
  const importPath = raw.importPath;
  if (typeof importPath !== "string") return [];
  const stories = Object.values(selected.index ?? {}).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    return candidate.type === "story" &&
      candidate.subtype !== "test" &&
      candidate.importPath === importPath &&
      typeof candidate.id === "string"
      ? [candidate.id]
      : [];
  });
  return stories.length > 0 && stories.every((storyId) => components.has(storyId)) ? stories : [];
}

export function sidebarStatus(item: SidebarItem, selected: SelectedReportStatus): SidebarStatus {
  if (!selected.report) return { kind: "unknown" };
  const components = storyComponents(selected.index, selected.mapping);
  const componentIds = new Set(
    itemStoryIds(item, selected, components).flatMap((id) => {
      const componentId = components.get(id);
      return componentId ? [componentId] : [];
    }),
  );
  if (componentIds.size === 0) return { kind: "unknown" };
  if (componentIds.size > 1) return { kind: "mixed" };
  const componentId = [...componentIds][0]!;
  const decision = selected.report.decisions.find((item) => item.componentId === componentId);
  return decision ? { kind: "decision", componentId, decision } : { kind: "unknown" };
}

type SelectedObserver = (selected: SelectedReportStatus) => void;
const observers = new Set<SelectedObserver>();
let current: SelectedReportStatus | undefined;

export function publishSelectedReportStatus(selected: SelectedReportStatus): void {
  current = selected;
  for (const observer of observers) observer(selected);
}

export function selectedReportStatus(): SelectedReportStatus | undefined {
  return current;
}

export function subscribeSelectedReportStatus(observer: SelectedObserver): () => void {
  observers.add(observer);
  return () => observers.delete(observer);
}
