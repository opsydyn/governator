import { expect, test, vi } from "vitest";
import { evaluate } from "../packages/core/src/index.ts";
import { at, evaluation } from "./fixtures.ts";
import {
  componentStatusForStory,
  publishSelectedReportStatus,
  readinessView,
  sidebarStatus,
  subscribeSelectedReportStatus,
} from "../packages/storybook-addon/src/status-view.ts";

const report = evaluate(evaluation());
const index = {
  "button--docs": {
    id: "button--docs",
    type: "docs",
    importPath: "./Button.stories.tsx",
  },
  "button--one": {
    id: "button--one",
    type: "story",
    title: "Button",
    name: "One",
    importPath: "./Button.stories.tsx",
    exportName: "One",
  },
  "unknown--one": {
    id: "unknown--one",
    type: "story",
    title: "Unknown",
    name: "One",
    importPath: "./Unknown.stories.tsx",
    exportName: "One",
  },
};
const mapping = {
  version: 1,
  stories: [
    {
      id: "button--one",
      componentId: "ui.button",
      importPath: "./Button.stories.tsx",
      exportName: "One",
    },
  ],
};

test("uses one readable readiness vocabulary everywhere", () => {
  expect(readinessView("ready")).toEqual({
    label: "Ready",
    tone: "success",
    description: "Required readiness evidence is complete.",
  });
  expect(readinessView("blocked")).toEqual({
    label: "Blocked",
    tone: "danger",
    description: "At least one readiness check blocks use.",
  });
  expect(readinessView("insufficient_evidence")).toEqual({
    label: "Missing evidence",
    tone: "warning",
    description: "Required readiness evidence is incomplete.",
  });
});

test("derives an unloaded story decision only from the validated story map", () => {
  expect(componentStatusForStory("button--one", index, mapping, report)?.componentId).toBe(
    "ui.button",
  );
  expect(componentStatusForStory("unknown--one", index, mapping, report)).toBeUndefined();
  expect(
    componentStatusForStory(
      "button--one",
      index,
      { ...mapping, stories: [{ ...mapping.stories[0], importPath: "./Wrong.tsx" }] },
      report,
    ),
  ).toBeUndefined();
});

test("sidebar parent and docs aggregate only an unambiguous mapped identity", () => {
  const selected = {
    reportUrl: "/report.json",
    verifySource: false,
    report,
    index,
    mapping,
  };
  expect(sidebarStatus({ id: "button--one", type: "story" }, selected)).toMatchObject({
    kind: "decision",
    componentId: "ui.button",
  });
  expect(sidebarStatus({ id: "button--docs", type: "docs" }, selected)).toMatchObject({
    kind: "decision",
    componentId: "ui.button",
  });
  expect(
    sidebarStatus({ id: "button", type: "component", children: ["button--one"] }, selected),
  ).toMatchObject({ kind: "decision", componentId: "ui.button" });
  expect(sidebarStatus({ id: "unknown--one", type: "story" }, selected)).toEqual({
    kind: "unknown",
  });
});

test("selected report status is keyed by report URL and verification mode", () => {
  const observer = vi.fn();
  const unsubscribe = subscribeSelectedReportStatus(observer);
  publishSelectedReportStatus({
    reportUrl: "/report.json",
    verifySource: false,
    report,
    index,
    mapping,
  });
  publishSelectedReportStatus({
    reportUrl: "/report.json",
    verifySource: true,
    report: undefined,
    index,
    mapping: undefined,
  });
  expect(observer).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ reportUrl: "/report.json", verifySource: false }),
  );
  expect(observer).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ reportUrl: "/report.json", verifySource: true }),
  );
  unsubscribe();
});

test("fixture report remains current for this status test", () => {
  expect(report.evaluatedAt).toBe(at);
});
