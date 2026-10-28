// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { evaluate } from "../packages/core/src/index.ts";
import { at, evaluation } from "./fixtures.ts";

const sb = vi.hoisted(() => ({
  panel: undefined as undefined | ((props: { active: boolean }) => React.ReactNode),
  storyId: undefined as string | undefined,
  index: {
    "button--primary": {
      id: "button--primary",
      type: "story",
      name: "Primary",
      title: "Button",
      importPath: "./Button.stories.tsx",
      exportName: "Primary",
    },
  } as Record<
    string,
    {
      id: string;
      type: string;
      name: string;
      title: string;
      importPath: string;
      exportName: string;
    }
  >,
  invalidate: undefined as undefined | (() => void),
  select: vi.fn(),
}));
vi.mock("storybook/manager-api", () => ({
  addons: {
    register: (_name: string, fn: () => void) => fn(),
    getConfig: () => ({}),
    setConfig: () => {},
    add: (_name: string, panel: { render: typeof sb.panel }) => {
      sb.panel = panel.render;
    },
  },
  types: { PANEL: "panel" },
  useParameter: () => ({ componentId: "ui.button", reportUrl: "/report.json" }),
  useStorybookState: () => ({ storyId: sb.storyId, index: sb.index }),
  useStorybookApi: () => ({
    selectStory: sb.select,
    on: (_event: string, fn: () => void) => {
      sb.invalidate = fn;
      return () => {};
    },
  }),
}));
vi.mock("storybook/internal/components", () => ({
  AddonPanel: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("storybook/theming", () => ({
  useTheme: () => ({
    base: "light",
    color: { defaultText: "black" },
    background: { content: "white" },
  }),
}));
import "../packages/storybook-addon/src/manager.tsx";

test("clears stale source links on Storybook index invalidation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  const mapping = {
    version: 1,
    stories: [
      {
        id: "button--primary",
        componentId: "ui.button",
        importPath: "./Button.stories.tsx",
        exportName: "Primary",
      },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string | URL) =>
        new Response(
          JSON.stringify(
            String(url).includes("governator-story-map") ? mapping : evaluate(evaluation()),
          ),
        ),
    ),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(sb.panel?.({ active: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  const filter = el.querySelector<HTMLSelectElement>('select[aria-label="Readiness filter"]')!;
  await act(async () => {
    filter.value = "all";
    filter.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(el.textContent).toContain("Open Button / Primary");
  await act(async () => sb.invalidate?.());
  expect(el.textContent).not.toContain("Open Button / Primary");
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("ignores an in-flight map after invalidation and loads the new index", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.storyId = undefined;
  sb.index = {
    "button--primary": {
      id: "button--primary",
      type: "story",
      name: "Primary",
      title: "Button",
      importPath: "./Button.stories.tsx",
      exportName: "Primary",
    },
  };
  const mapping = {
    version: 1,
    stories: [
      {
        id: "button--primary",
        componentId: "ui.button",
        importPath: "./Button.stories.tsx",
        exportName: "Primary",
      },
    ],
  };
  let resolveMap!: (value: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    resolveMap = resolve;
  });
  let requests = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      if (String(url).includes("governator-story-map"))
        return ++requests === 1 ? pending : new Response(JSON.stringify(mapping));
      return new Response(JSON.stringify(evaluate(evaluation())));
    }),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(sb.panel?.({ active: true }));
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
  const filter = el.querySelector<HTMLSelectElement>('select[aria-label="Readiness filter"]')!;
  await act(async () => {
    filter.value = "all";
    filter.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => sb.invalidate?.());
  await act(async () => {
    resolveMap(new Response(JSON.stringify(mapping)));
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
  expect(el.textContent).not.toContain("Open Button / Primary");
  sb.index = { ...sb.index };
  await act(async () => {
    root.render(sb.panel?.({ active: true }));
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  expect(el.textContent).toContain("Open Button / Primary");
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("keeps a draft through sidebar story changes and blocks discovery until resolved", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.storyId = "button--primary";
  sb.select.mockClear();
  sb.index = {
    ...sb.index,
    "button--other": {
      id: "button--other",
      type: "story",
      name: "Other",
      title: "Button",
      importPath: "./Other.stories.tsx",
      exportName: "Other",
    },
  };
  const mapping = {
    version: 1,
    stories: [
      {
        id: "button--primary",
        componentId: "ui.button",
        importPath: "./Button.stories.tsx",
        exportName: "Primary",
      },
      {
        id: "button--other",
        componentId: "ui.button",
        importPath: "./Other.stories.tsx",
        exportName: "Other",
      },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const path = String(url);
      if (path.includes("governator-story-map")) return new Response(JSON.stringify(mapping));
      if (path.includes("index.json"))
        return new Response(
          JSON.stringify({
            entries: {
              "button--primary": { importPath: "./Button.stories.tsx" },
              "button--other": { importPath: "./Other.stories.tsx" },
            },
          }),
        );
      if (path.includes("tag-editor"))
        return new Response(JSON.stringify({ tags: ["forms"], revision: "old" }));
      return new Response(JSON.stringify(evaluate(evaluation())));
    }),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  const render = async () => {
    await act(async () => {
      root.render(sb.panel?.({ active: true }));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  };
  await render();
  await act(async () =>
    el.querySelector<HTMLButtonElement>('[aria-label="Remove forms"]')!.click(),
  );
  const filter = el.querySelector<HTMLSelectElement>('select[aria-label="Readiness filter"]')!;
  await act(async () => {
    filter.value = "all";
    filter.dispatchEvent(new Event("change", { bubbles: true }));
  });
  // A different story selected through discovery must not discard the draft.
  const open = [...el.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Open Button / Other"),
  )!;
  expect(open).toBeDefined();
  await act(async () => open.click());
  expect(sb.select).not.toHaveBeenCalled();
  expect(el.textContent).toContain("Save or discard your tag edits");
  sb.storyId = "button--other";
  await render();
  sb.storyId = "button--primary";
  await render();
  expect(el.textContent).toContain("Unsaved tag edits restored");
  expect(el.querySelector('[aria-label="Remove forms"]')).toBeNull();
  await act(async () => root.render(null));
  await render();
  expect(el.textContent).toContain("Unsaved tag edits restored");
  expect(el.querySelector('[aria-label="Remove forms"]')).toBeNull();
  await act(async () =>
    [...el.querySelectorAll("button")]
      .find((button) => button.textContent === "Discard changes")!
      .click(),
  );
  await act(async () => root.unmount());
  el.remove();
  sb.storyId = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
