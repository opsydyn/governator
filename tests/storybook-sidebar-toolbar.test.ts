// @vitest-environment happy-dom
import { stubStorybookGlobal } from "./storybook-static-fetch.ts";
import React, { act } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { evaluate } from "../packages/core/src/index.ts";
import { at, evaluation } from "./fixtures.ts";
import {
  publishReportObservation,
  subscribeReportObservations,
} from "../packages/storybook-addon/src/report.ts";

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
/* oxlint-disable linteffect/no-react-state, linteffect/no-return-in-callback -- this test double mirrors Storybook's local disclosure and Escape behavior */
function WithTooltipTestDouble({
  children,
  tooltip,
  onVisibleChange,
}: {
  children: React.ReactNode;
  tooltip: React.ReactNode | ((controls: { onHide: () => void }) => React.ReactNode);
  onVisibleChange?: (visible: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(
    function closeOnEscape() {
      if (!open) return;
      const close = (event: KeyboardEvent) => {
        if (event.key === "Escape") setOpen(false);
      };
      document.addEventListener("keydown", close);
      return function removeEscapeHandler() {
        document.removeEventListener("keydown", close);
      };
    },
    [open],
  );
  const setVisible = (visible: boolean) => {
    setOpen(visible);
    onVisibleChange?.(visible);
  };
  return React.createElement(
    React.Fragment,
    null,
    React.createElement("span", { onClick: () => setVisible(!open) }, children),
    open
      ? createPortal(
          typeof tooltip === "function" ? tooltip({ onHide: () => setVisible(false) }) : tooltip,
          document.body,
        )
      : null,
  );
}
/* oxlint-enable linteffect/no-react-state, linteffect/no-return-in-callback */
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
vi.mock("storybook/internal/components", () => ({ WithTooltip: WithTooltipTestDouble }));
import { GovernanceSidebarFilter } from "../packages/storybook-addon/src/sidebar-toolbar.tsx";

test("applies the named filter, preserves unknown entries, and clears on report expiry", async () => {
  stubStorybookGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
  stubStorybookGlobal(
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
  stubStorybookGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sb.params = {};
  sb.filters = {};
  sb.set.mockClear();
  stubStorybookGlobal(
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
  expect(el.textContent).not.toContain("Select a story with a current governance report");
  const help = el.querySelector<HTMLButtonElement>('[aria-label="Readiness filter help"]');
  expect(help).not.toBeNull();
  await act(async () => help!.click());
  expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
    "governance report not configured",
  );
  await act(async () => root.unmount());
  el.remove();
  sb.params = { reportUrl: "/report.json" };
  vi.unstubAllGlobals();
});

test("clears a filter when the panel observes the selected report has become unavailable", async () => {
  stubStorybookGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
  stubStorybookGlobal(
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
  stubStorybookGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
  stubStorybookGlobal(
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
  stubStorybookGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.params = { reportUrl: "/report.json" };
  sb.refs = {};
  let reachable = false;
  stubStorybookGlobal(
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

test("enabled local source verification keeps a mismatched report from filtering", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.params = { reportUrl: "/report.json", registryEditor: true } as typeof sb.params;
  sb.refs = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string | URL) =>
        new Response(
          JSON.stringify(
            String(url).includes("registry-source")
              ? { matches: false }
              : String(url).includes("governator-story-map")
                ? {
                    version: 1,
                    stories: [
                      {
                        id: "button--one",
                        componentId: "ui.button",
                        importPath: "./Button.stories.tsx",
                        exportName: "One",
                      },
                    ],
                  }
                : evaluate(evaluation()),
          ),
        ),
    ),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
  expect(
    el.querySelector<HTMLSelectElement>('select[aria-label="Filter sidebar by readiness"]')!
      .disabled,
  ).toBe(true);
  expect(sb.filters["governator/readiness"]!(sb.index["button--one"])).toBe(true);
  expect(el.textContent).not.toContain("Report does not match this checkout");
  const help = el.querySelector<HTMLButtonElement>('button[aria-label="Readiness filter help"]')!;
  await act(async () => help.click());
  const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
  expect(dialog).not.toBeNull();
  expect(help.getAttribute("aria-haspopup")).toBe("dialog");
  expect(help.getAttribute("aria-controls")).toBe(dialog!.id);
  expect(dialog!.getAttribute("aria-labelledby")).not.toBeNull();
  expect(document.getElementById(dialog!.getAttribute("aria-labelledby")!)?.textContent).toBe(
    "Readiness unavailable",
  );
  expect(dialog?.textContent).toContain(
    "Report does not match this checkout. Regenerate the report, then retry.",
  );
  expect(document.activeElement).toBe(
    dialog!.querySelector('button[aria-label="Retry readiness filter"]'),
  );
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await Promise.resolve();
    vi.advanceTimersByTime(0);
  });
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(help);
  await act(async () => root.unmount());
  el.remove();
  sb.params = { reportUrl: "/report.json" };
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("registry edits immediately clear an active readiness filter", async () => {
  stubStorybookGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.params = { reportUrl: "/report.json" };
  sb.refs = {};
  stubStorybookGlobal(
    "fetch",
    vi.fn(
      async (url: string | URL) =>
        new Response(
          JSON.stringify(
            String(url).includes("governator-story-map")
              ? {
                  version: 1,
                  stories: [
                    {
                      id: "button--one",
                      componentId: "ui.button",
                      importPath: "./Button.stories.tsx",
                      exportName: "One",
                    },
                  ],
                }
              : evaluate(evaluation()),
          ),
        ),
    ),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 15; i++) await Promise.resolve();
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
    window.dispatchEvent(new Event("governator:registry-changed"));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  expect(select.disabled).toBe(true);
  expect(sb.filters["governator/readiness"]!(sb.index["button--one"])).toBe(true);
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("returning focus rechecks local source consistency and clears an outdated filter", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.params = { reportUrl: "/report.json", registryEditor: true } as typeof sb.params;
  sb.refs = {};
  let matches = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string | URL) =>
        new Response(
          JSON.stringify(
            String(url).includes("registry-source")
              ? { matches }
              : String(url).includes("governator-story-map")
                ? {
                    version: 1,
                    stories: [
                      {
                        id: "button--one",
                        componentId: "ui.button",
                        importPath: "./Button.stories.tsx",
                        exportName: "One",
                      },
                    ],
                  }
                : evaluate(evaluation()),
          ),
        ),
    ),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 30; i++) await Promise.resolve();
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
  matches = false;
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
  expect(select.disabled).toBe(true);
  expect(sb.filters["governator/readiness"]!(sb.index["button--one"])).toBe(true);
  await act(async () => root.unmount());
  el.remove();
  sb.params = { reportUrl: "/report.json" };
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("a slow source check after focus still clears an outdated filter", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.params = { reportUrl: "/report.json", registryEditor: true } as typeof sb.params;
  sb.refs = {};
  let slow = false;
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("registry-source") && slow
        ? pending
        : new Response(
            JSON.stringify(
              String(url).includes("registry-source")
                ? { matches: true }
                : String(url).includes("governator-story-map")
                  ? {
                      version: 1,
                      stories: [
                        {
                          id: "button--one",
                          componentId: "ui.button",
                          importPath: "./Button.stories.tsx",
                          exportName: "One",
                        },
                      ],
                    }
                  : evaluate(evaluation()),
            ),
          ),
    ),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
  const select = el.querySelector<HTMLSelectElement>(
    'select[aria-label="Filter sidebar by readiness"]',
  )!;
  await act(async () => {
    select.value = "blocked";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  slow = true;
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  await act(async () => {
    finish(new Response(JSON.stringify({ matches: false })));
    for (let i = 0; i < 16; i++) await Promise.resolve();
  });
  expect(select.disabled).toBe(true);
  expect(sb.filters["governator/readiness"]!(sb.index["button--one"])).toBe(true);
  await act(async () => root.unmount());
  el.remove();
  sb.params = { reportUrl: "/report.json" };
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("switching the same report to verified mode does not reuse a snapshot observation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.params = { reportUrl: "/report.json" };
  sb.refs = {};
  let verifying = false;
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("registry-source")
        ? verifying
          ? pending
          : new Response("", { status: 404 })
        : new Response(
            JSON.stringify(
              String(url).includes("governator-story-map")
                ? {
                    version: 1,
                    stories: [
                      {
                        id: "button--one",
                        componentId: "ui.button",
                        importPath: "./Button.stories.tsx",
                        exportName: "One",
                      },
                    ],
                  }
                : evaluate(evaluation()),
            ),
          ),
    ),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 16; i++) await Promise.resolve();
  });
  const select = el.querySelector<HTMLSelectElement>(
    'select[aria-label="Filter sidebar by readiness"]',
  )!;
  expect(select.disabled).toBe(false);
  verifying = true;
  sb.params = { reportUrl: "/report.json", registryEditor: true } as typeof sb.params;
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  await act(async () => {
    publishReportObservation("/report.json", {
      status: "ready",
      report: evaluate(evaluation()),
      source: "snapshot",
    });
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  expect(select.disabled).toBe(true);
  await act(async () => {
    finish(new Response(JSON.stringify({ matches: false })));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  expect(select.disabled).toBe(true);
  await act(async () => root.unmount());
  el.remove();
  sb.params = { reportUrl: "/report.json" };
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("a hung source recheck times out and clears an active filter", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.params = { reportUrl: "/report.json", registryEditor: true } as typeof sb.params;
  sb.refs = {};
  let hang = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("registry-source") && hang
        ? new Promise<Response>(() => {})
        : new Response(
            JSON.stringify(
              String(url).includes("registry-source")
                ? { matches: true }
                : String(url).includes("governator-story-map")
                  ? {
                      version: 1,
                      stories: [
                        {
                          id: "button--one",
                          componentId: "ui.button",
                          importPath: "./Button.stories.tsx",
                          exportName: "One",
                        },
                      ],
                    }
                  : evaluate(evaluation()),
            ),
          ),
    ),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
  const select = el.querySelector<HTMLSelectElement>(
    'select[aria-label="Filter sidebar by readiness"]',
  )!;
  await act(async () => {
    select.value = "blocked";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  hang = true;
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(10_001);
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  expect(select.disabled).toBe(true);
  expect(sb.filters["governator/readiness"]!(sb.index["button--one"])).toBe(true);
  await act(async () => root.unmount());
  el.remove();
  sb.params = { reportUrl: "/report.json" };
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("a verified-mode static snapshot observation can enable its toolbar", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.params = { reportUrl: "/report.json", registryEditor: true } as typeof sb.params;
  sb.refs = {};
  const pending = new Promise<Response>(() => {});
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
        : pending,
    ),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  await act(async () => {
    publishReportObservation(
      "/report.json",
      { status: "ready", report: evaluate(evaluation()), source: "snapshot" },
      true,
    );
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  expect(
    el.querySelector<HTMLSelectElement>('select[aria-label="Filter sidebar by readiness"]')!
      .disabled,
  ).toBe(false);
  await act(async () => root.unmount());
  el.remove();
  sb.params = { reportUrl: "/report.json" };
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("explains a missing story map and can retry after it becomes available", async () => {
  stubStorybookGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.params = { reportUrl: "/report.json" };
  sb.refs = {};
  let available = false;
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
  stubStorybookGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("governator-story-map") && !available
        ? new Response("missing", { status: 404 })
        : new Response(
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
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
  const select = el.querySelector<HTMLSelectElement>(
    'select[aria-label="Filter sidebar by readiness"]',
  )!;
  expect(select.disabled).toBe(true);
  await act(async () =>
    el.querySelector<HTMLButtonElement>('button[aria-label="Readiness filter help"]')!.click(),
  );
  expect(document.body.querySelector('[role="dialog"]')?.textContent).toMatch(
    /story mapping.*unavailable/i,
  );
  const retry = document.body.querySelector<HTMLButtonElement>(
    'button[aria-label="Retry readiness filter"]',
  )!;
  expect(retry).not.toBeNull();
  available = true;
  await act(async () => {
    retry.click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
  expect(select.disabled).toBe(false);
  await act(async () => {
    select.value = "blocked";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  expect(sb.filters["governator/readiness"]!(sb.index["button--one"])).toBe(false);
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("explains a failed configured report instead of asking to select a story", async () => {
  stubStorybookGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sb.params = { reportUrl: "/missing-report.json" };
  sb.refs = {};
  stubStorybookGlobal(
    "fetch",
    vi.fn(async () => new Response("missing", { status: 404 })),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  await act(async () =>
    el.querySelector<HTMLButtonElement>('button[aria-label="Readiness filter help"]')!.click(),
  );
  expect(el.querySelector('[role="dialog"]')).toBeNull();
  expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
    "governance report unavailable (HTTP 404)",
  );
  await act(async () => root.unmount());
  el.remove();
  sb.params = { reportUrl: "/report.json" };
  vi.unstubAllGlobals();
});

test("retry publishes the refreshed report for sidebar labels", async () => {
  stubStorybookGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  sb.params = { reportUrl: "/report.json" };
  sb.refs = {};
  let available = false;
  const events: string[] = [];
  const unsubscribe = subscribeReportObservations((url, state) => {
    if (url === "/report.json") events.push(state.status);
  });
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
  stubStorybookGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("governator-story-map")
        ? new Response(JSON.stringify(mapping))
        : available
          ? new Response(JSON.stringify(evaluate(evaluation())))
          : new Response("missing", { status: 404 }),
    ),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(React.createElement(GovernanceSidebarFilter));
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
  available = true;
  events.length = 0;
  await act(async () => {
    el.querySelector<HTMLButtonElement>('button[aria-label="Readiness filter help"]')!.click();
  });
  await act(async () => {
    document.body
      .querySelector<HTMLButtonElement>('button[aria-label="Retry readiness filter"]')!
      .click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
  expect(events).toContain("ready");
  await act(async () => root.unmount());
  el.remove();
  unsubscribe();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
