import { describe, expect, test, vi } from "vitest";
import {
  createReadinessFilter,
  ReadinessFilterController,
  storyIndexSignature,
} from "../packages/storybook-addon/src/sidebar-filter.ts";

const index = {
  "button--one": {
    id: "button--one",
    type: "story",
    subtype: "story",
    title: "Button",
    name: "One",
    importPath: "./Button.stories.tsx",
    exportName: "One",
  },
  "select--one": {
    id: "select--one",
    type: "story",
    subtype: "story",
    title: "Select",
    name: "One",
    importPath: "./Select.stories.tsx",
    exportName: "One",
  },
  "select--docs": {
    id: "select--docs",
    type: "docs",
    title: "Select",
    name: "Docs",
    importPath: "./Select.stories.tsx",
  },
  "unknown--one": {
    id: "unknown--one",
    type: "story",
    subtype: "story",
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
    {
      id: "select--one",
      componentId: "ui.select",
      importPath: "./Select.stories.tsx",
      exportName: "One",
    },
  ],
};
const decisions = [
  { componentId: "ui.button", gate: "ready" },
  { componentId: "ui.select", gate: "blocked" },
] as const;

describe("governance sidebar filters", () => {
  test("filters verified stories and docs by readiness while keeping unmapped entries visible", () => {
    const filter = createReadinessFilter("blocked", index, mapping, decisions);
    expect(filter(index["button--one"])).toBe(false);
    expect(filter(index["select--one"])).toBe(true);
    expect(filter(index["select--docs"])).toBe(true);
    expect(filter(index["unknown--one"])).toBe(true);
    expect(createReadinessFilter("ready", index, mapping, decisions)(index["select--docs"])).toBe(
      false,
    );
    expect(
      createReadinessFilter(
        "insufficient_evidence",
        index,
        mapping,
        decisions,
      )(index["select--one"]),
    ).toBe(false);
    expect(
      createReadinessFilter("attention", index, mapping, decisions)(index["select--one"]),
    ).toBe(true);
  });
  test("keeps ambiguous documentation visible when a sibling story is unmapped", () => {
    const partial = {
      ...index,
      "select--other": {
        id: "select--other",
        type: "story",
        title: "Select",
        name: "Other",
        importPath: "./Select.stories.tsx",
        exportName: "Other",
      },
    };
    expect(createReadinessFilter("ready", partial, mapping, decisions)(index["select--docs"])).toBe(
      true,
    );
  });
  test("treats absent or malformed mappings as unknown rather than excluding stories", () => {
    expect(
      createReadinessFilter("blocked", index, undefined, decisions)(index["button--one"]),
    ).toBe(true);
    expect(createReadinessFilter("all", index, mapping, decisions)(index["button--one"])).toBe(
      true,
    );
  });
});

test("serializes reindexing and a later clear immediately supersedes a pending restrictive filter", async () => {
  let finish!: () => void;
  const first = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let installed: (item: { id: string; type: string }) => boolean = () => true;
  const apply = vi.fn(async (filter: typeof installed) => {
    installed = filter;
    if (apply.mock.calls.length === 1) await first;
  });
  const controller = new ReadinessFilterController(apply);
  const firstUpdate = controller.set(() => false);
  await Promise.resolve();
  await Promise.resolve();
  expect(installed({ id: "x", type: "story" })).toBe(false);
  const clear = controller.set(() => true);
  expect(installed({ id: "x", type: "story" })).toBe(true);
  finish();
  await firstUpdate;
  await clear;
  expect(installed({ id: "x", type: "story" })).toBe(true);
  expect(apply).toHaveBeenCalledTimes(2);
});

test("index signature ignores Storybook reindex churn but detects source changes", () => {
  expect(storyIndexSignature({ ...index })).toBe(storyIndexSignature(index));
  expect(
    storyIndexSignature({
      ...index,
      "button--one": { ...index["button--one"], prepared: true, parameters: { foo: 1 } },
    }),
  ).toBe(storyIndexSignature(index));
  expect(
    storyIndexSignature({
      ...index,
      "button--one": { ...index["button--one"], importPath: "./Moved.stories.tsx" },
    }),
  ).not.toBe(storyIndexSignature(index));
});
