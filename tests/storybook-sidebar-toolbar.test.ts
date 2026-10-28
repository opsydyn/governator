// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { evaluate } from "../packages/core/src/index.ts";
import { at, evaluation } from "./fixtures.ts";
import { publishReportObservation } from "../packages/storybook-addon/src/report.ts";

const sb = vi.hoisted(() => ({
  index: {
    "button--one": {
      id: "button--one",
      type: "story",
      title: "Button",
      name: "One",
      importPath: "./Button.stories.tsx",
      exportName: "One",
    },
  },
  refs: {} as Record<string, unknown>,
  params: { reportUrl: "/report.json" } as { reportUrl?: string },
  listener: undefined as undefined | (() => void),
  filters: {} as Record<string, (item: { id: string; type: string }) => boolean>,
  set: vi.fn(async (updates: Record<string, (item: { id: string; type: string }) => boolean>) => {
    Object.assign(sb.filters, updates);
  }),
}));
const api = {
  on: (_event: string, callback: () => void) => {
    sb.listener = callback;
    return () => {};
  },
  experimental_setFilters: sb.set,
};
vi.mock("storybook/manager-api", () => ({
  useStorybookApi: () => api,
  useStorybookState: () => ({ index: sb.index, refs: sb.refs }),
  useParameter: () => sb.params,
}));
vi.mock("storybook/theming", () => ({
  useTheme: () => ({
    base: "light",
    color: { defaultText: "black" },
    background: { content: "white" },
  }),
}));
import { GovernanceSidebarFilter } from "../packages/storybook-addon/src/sidebar-toolbar.tsx";

test("applies the named filter, preserves unknown entries, and clears on report expiry", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  const snapshot = evaluate(evaluation());
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
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string | URL) =>
        new Response(
          JSON.stringify(String(url).includes("governator-story-map") ? mapping : snapshot),
        ),
    ),
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  const select = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Filter sidebar by readiness"]',
  )!;
  expect(select.disabled).toBe(false);
  await act(async () => {
    select.value = "blocked";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  expect(sb.filters["governator/readiness"]!(sb.index["button--one"])).toBe(false);
  expect(sb.filters["governator/readiness"]!({ id: "unmapped", type: "story" })).toBe(true);
  expect(Object.keys(sb.filters)).toEqual(["governator/readiness"]);
  const calls = sb.set.mock.calls.length;
  sb.index = { ...sb.index };
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  expect(sb.set).toHaveBeenCalledTimes(calls);
  sb.refs = { remote: {} };
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  expect(select.disabled).toBe(true);
  expect(sb.filters["governator/readiness"]!(sb.index["button--one"])).toBe(true);
  sb.refs = {};
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  await act(async () => {
    select.value = "blocked";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  await act(async () => {
    sb.listener?.();
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  expect(sb.filters["governator/readiness"]!(sb.index["button--one"])).toBe(true);
  await act(async () => {
    select.value = "blocked";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  expect(sb.filters["governator/readiness"]!(sb.index["button--one"])).toBe(true);
  expect(select.disabled).toBe(true);
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("no report keeps the sidebar unfiltered and the control unavailable", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sb.params = {};
  sb.filters = {};
  sb.set.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("missing", { status: 404 })),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  expect(
    el.querySelector<HTMLSelectElement>('select[aria-label="Filter sidebar by readiness"]')
      ?.disabled,
  ).toBe(true);
  expect(sb.filters["governator/readiness"]!({ id: "x", type: "story" })).toBe(true);
  await act(async () => root.unmount());
  el.remove();
  sb.params = { reportUrl: "/report.json" };
  vi.unstubAllGlobals();
});

test("clears a filter when the panel observes the selected report has become unavailable", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.params = { reportUrl: "/report.json" };
  sb.refs = {};
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
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  const select = el.querySelector<HTMLSelectElement>(
    'select[aria-label="Filter sidebar by readiness"]',
  )!;
  await act(async () => {
    select.value = "blocked";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  expect(sb.filters["governator/readiness"]!(sb.index["button--one"])).toBe(false);
  await act(async () => {
    publishReportObservation("/report.json", { status: "error", message: "missing" });
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  expect(select.disabled).toBe(true);
  expect(sb.filters["governator/readiness"]!(sb.index["button--one"])).toBe(true);
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("an older toolbar response cannot override a newer unavailable panel observation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.params = { reportUrl: "/report.json" };
  sb.refs = {};
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
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("governator-story-map")
        ? new Response(JSON.stringify(mapping))
        : pending,
    ),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  await act(async () => {
    publishReportObservation("/report.json", { status: "error", message: "missing" });
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
  await act(async () => {
    finish(new Response(JSON.stringify(evaluate(evaluation()))));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  expect(
    el.querySelector<HTMLSelectElement>('select[aria-label="Filter sidebar by readiness"]')
      ?.disabled,
  ).toBe(true);
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("a timed-out report can recover when the window regains focus", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.params = { reportUrl: "/report.json" };
  sb.refs = {};
  let reachable = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("governator-story-map")
        ? new Response(
            JSON.stringify({
              version: 1,
              stories: [
                {
                  id: "button--one",
                  componentId: "ui.button",
                  importPath: "./Button.stories.tsx",
                  exportName: "One",
                },
              ],
            }),
          )
        : reachable
          ? new Response(JSON.stringify(evaluate(evaluation())))
          : new Promise<Response>(() => {}),
    ),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(10_000);
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  const select = el.querySelector<HTMLSelectElement>(
    'select[aria-label="Filter sidebar by readiness"]',
  )!;
  expect(select.disabled).toBe(true);
  reachable = true;
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    for (let i = 0; i < 16; i++) await Promise.resolve();
  });
  expect(select.disabled).toBe(false);
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
