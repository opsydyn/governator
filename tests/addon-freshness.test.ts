// @vitest-environment happy-dom
import { stubStorybookGlobal } from "./storybook-static-fetch.ts";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { evaluate } from "../packages/core/src/index.ts";
import { at, evaluation } from "./fixtures.ts";
import { publishSelectedReportStatus } from "../packages/storybook-addon/src/status-view.ts";

const storybook = vi.hoisted(() => ({
  params: { componentId: "ui.button", reportUrl: "/one.json" },
  renderPanel: undefined as undefined | ((props: { active: boolean }) => React.ReactNode),
  renderLabel: undefined as undefined | ((item: unknown, api: unknown) => React.ReactNode),
}));
vi.mock("storybook/manager-api", () => ({
  addons: {
    register: (_name: string, callback: () => void) => callback(),
    getConfig: () => ({}),
    setConfig: (config: { sidebar: { renderLabel: typeof storybook.renderLabel } }) => {
      storybook.renderLabel = config.sidebar.renderLabel;
    },
    add: (_name: string, panel: { render: (props: { active: boolean }) => React.ReactNode }) => {
      storybook.renderPanel = panel.render;
    },
  },
  types: { PANEL: "panel" },
  useParameter: () => storybook.params,
  useStorybookState: () => ({ storyId: undefined }),
  useStorybookApi: () => ({ selectStory: () => {}, on: () => () => {} }),
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

const snapshot = () => evaluate(evaluation());
const publishSidebar = (report = snapshot()) =>
  publishSelectedReportStatus({
    reportUrl: storybook.params.reportUrl,
    verifySource: false,
    report,
    index: {
      story: {
        type: "story",
        id: "story",
        title: "Components/Button",
        name: "Button",
        importPath: "./Button.stories.tsx",
        exportName: "Primary",
      },
    },
    mapping: {
      version: 1,
      stories: [
        {
          id: "story",
          componentId: "ui.button",
          importPath: "./Button.stories.tsx",
          exportName: "Primary",
        },
      ],
    },
  });
const deadline = Date.parse(at) + 24 * 60 * 60 * 1000;
const response = (body = snapshot()) => new Response(JSON.stringify(body));
let testIndex = 0;
const caseUrl = (name: string) => `/freshness-${testIndex}/${name}.json`;
let container: HTMLDivElement;
let root: Root;
const renderPanel = () => storybook.renderPanel?.({ active: true });
const renderLabel = () =>
  storybook.renderLabel?.(
    { type: "story", id: "story", name: "Button" },
    { getParameters: () => storybook.params },
  );
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(deadline - 10);
  testIndex++;
  storybook.params = { componentId: "ui.button", reportUrl: caseUrl("one") };
  publishSelectedReportStatus({
    reportUrl: storybook.params.reportUrl,
    verifySource: false,
    report: undefined,
    index: undefined,
    mapping: undefined,
  });
  stubStorybookGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stubStorybookGlobal(
    "fetch",
    vi.fn(async () => response()),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("mounted freshness", () => {
  test("panel expires at the first millisecond after 24 hours", async () => {
    await act(async () => root.render(renderPanel()));
    await flush();
    expect(container.textContent).toContain("Required readiness evidence is complete.");
    expect(container.textContent).toContain("Find components");
    await act(async () => vi.advanceTimersByTime(10));
    expect(container.textContent).toContain("Required readiness evidence is complete.");
    await act(async () => vi.advanceTimersByTime(1));
    expect(container.textContent).toContain("older than 24 hours");
    expect(container.textContent).not.toContain("Required readiness evidence is complete.");
    expect(container.textContent).not.toContain("Find components");
  });
  test("expiry recovers focus from a discovery control", async () => {
    await act(async () => root.render(renderPanel()));
    await flush();
    const discovery = container.querySelector<HTMLDetailsElement>(".gn-discovery")!;
    discovery.open = true;
    const select = discovery.querySelector<HTMLSelectElement>("select")!;
    select.focus();
    expect(document.activeElement).toBe(select);
    await act(async () => vi.advanceTimersByTime(11));
    expect(container.textContent).not.toContain("Find components");
    expect(document.activeElement).toBe(container.querySelector("[data-reload]"));
  });
  test.each(["visibilitychange", "focus"])(
    "%s revalidates after timers are suspended",
    async (event) => {
      await act(async () =>
        root.render(React.createElement(React.Fragment, null, renderPanel(), renderLabel())),
      );
      await flush();
      expect(container.textContent).toContain("Required readiness evidence is complete.");
      expect(fetch).toHaveBeenCalledTimes(2);
      vi.setSystemTime(deadline + 1);
      await act(async () =>
        (event === "focus" ? window : document).dispatchEvent(new Event(event)),
      );
      expect(container.textContent).not.toContain("Required readiness evidence is complete.");
      expect(container.textContent).toContain("Unverified");
    },
  );
  test("an older response cannot replace the changed URL", async () => {
    let finish!: (response: Response) => void;
    const initialUrl = storybook.params.reportUrl;
    stubStorybookGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.endsWith(initialUrl)
          ? new Promise<Response>((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(response()),
      ),
    );
    await act(async () => root.render(renderPanel()));
    storybook.params = { ...storybook.params, reportUrl: caseUrl("two") };
    await act(async () => root.render(renderPanel()));
    await flush();
    expect(container.textContent).toContain("Required readiness evidence is complete.");
    await act(async () => finish(new Response("not JSON")));
    expect(container.textContent).toContain("Required readiness evidence is complete.");
  });
  test("panel and sidebar expire at the earlier release timestamp", async () => {
    const report = {
      ...snapshot(),
      evaluatedAt: new Date(deadline).toISOString(),
      release: {
        gate: "blocked",
        status: "not_eligible",
        assurance: "unverified",
        baselineVersion: "8.4.1",
        candidateVersion: "8.4.2",
        baselineDigest: "sha256:baseline",
        candidateDigest: "sha256:candidate",
        sourceCommit: "a".repeat(40),
        evaluatedAt: at,
        inputDigest: "sha256:inputs",
        minimumBump: "major",
        declaredBump: "patch",
        candidateManifest: "artifacts/candidate/candidate.json",
        affectedComponents: ["ui.button"],
        reasons: ["Missing"],
        remediation: ["Fix"],
        publishable: false,
      },
    };
    storybook.params = { ...storybook.params, reportUrl: caseUrl("release") };
    stubStorybookGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(report))),
    );
    await act(async () =>
      root.render(React.createElement(React.Fragment, null, renderPanel(), renderLabel())),
    );
    await flush();
    expect(container.textContent).toContain("Required readiness evidence is complete.");
    await act(async () => vi.advanceTimersByTime(11));
    expect(container.textContent).not.toContain("Required readiness evidence is complete.");
    expect(container.textContent).toContain("release candidate snapshot");
    expect(container.textContent).toContain("Unverified");
  });
  test("a timed out request cannot revive the panel when a fetch ignores abort", async () => {
    let finish!: (response: Response) => void;
    stubStorybookGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    await act(async () => root.render(renderPanel()));
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(container.textContent).toMatch(/could not be loaded|timed out/i);
    await act(async () => finish(response()));
    expect(container.textContent).not.toContain("Required readiness evidence is complete.");
  });

  test("reload ignores the older request after a newer response wins", async () => {
    let finish!: (response: Response) => void;
    let calls = 0;
    stubStorybookGlobal(
      "fetch",
      vi.fn(() =>
        ++calls === 1
          ? new Promise<Response>((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(response()),
      ),
    );
    await act(async () => root.render(renderPanel()));
    const button = [...container.querySelectorAll("button")].find(
      (item) => item.textContent === "Reload report",
    );
    expect(button).toBeDefined();
    await act(async () => button?.click());
    await flush();
    expect(container.textContent).toContain("Required readiness evidence is complete.");
    await act(async () => finish(new Response("failure", { status: 500 })));
    expect(container.textContent).toContain("Required readiness evidence is complete.");
  });
  test("unmount aborts the request and ignores a late response", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetcher = vi.fn((_url: string, _options: RequestInit) => pending);
    stubStorybookGlobal("fetch", fetcher);
    await act(async () => root.render(renderPanel()));
    await act(async () => root.render(null));
    expect(fetcher.mock.calls[0]?.[1].signal?.aborted).toBe(true);
    await act(async () => finish(response()));
    expect(container.textContent).toBe("");
  });
});

test("registry changes invalidate panel decisions immediately", async () => {
  await act(async () => root.render(renderPanel()));
  await flush();
  expect(container.textContent).toContain("Required readiness evidence is complete.");
  await act(async () => window.dispatchEvent(new Event("governator:registry-changed")));
  expect(container.textContent).not.toContain("Required readiness evidence is complete.");
  expect(container.textContent).toMatch(/registry changed/i);
});

test("panel checks a locally verified report again when the window regains focus", async () => {
  let matches = true;
  storybook.params = { ...storybook.params, registryEditor: true } as typeof storybook.params;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string | URL) =>
        new Response(
          JSON.stringify(String(url).includes("registry-source") ? { matches } : snapshot()),
        ),
    ),
  );
  await act(async () => {
    root.render(renderPanel());
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
  expect(container.textContent).toContain("Required readiness evidence is complete.");
  matches = false;
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
  expect(container.textContent).not.toContain("Required readiness evidence is complete.");
  expect(container.textContent).toMatch(/registry changed/i);
});

test("sidebar uses readable, colour-coded readiness and the panel uses the supplied monogram", async () => {
  publishSidebar();
  await act(async () =>
    root.render(React.createElement(React.Fragment, null, renderPanel(), renderLabel())),
  );
  await flush();
  const badge = container.querySelector<HTMLElement>('[data-governator-gate="ready"]');
  expect(badge?.textContent).toBe("Ready");
  expect(badge?.classList.contains("gn-sidebar-gate")).toBe(true);
  expect(container.textContent).toContain("Candidate");
  const logo = container.querySelector<HTMLImageElement>("img[data-governator-logo]");
  expect(logo?.src).toMatch(/^data:image\/svg\+xml,/);
  expect(logo?.getAttribute("alt")).toBe("");
});
