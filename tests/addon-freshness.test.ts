// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { evaluate } from "../packages/core/src/index.ts";
import { at, evaluation } from "./fixtures.ts";

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
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
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
    expect(container.textContent).toContain("Gate:");
    expect(container.textContent).toContain("Find components");
    await act(async () => vi.advanceTimersByTime(10));
    expect(container.textContent).toContain("Gate:");
    await act(async () => vi.advanceTimersByTime(1));
    expect(container.textContent).toContain("older than 24 hours");
    expect(container.textContent).not.toContain("Gate:");
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
  test("sidebar revalidates a cached observation before showing it", async () => {
    await act(async () => root.render(renderLabel()));
    await flush();
    expect(container.textContent).toContain("L ");
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => root.render(null));
    vi.setSystemTime(deadline + 1);
    await act(async () => root.render(renderLabel()));
    await flush();
    expect(container.textContent).toContain("?");
    expect(container.textContent).not.toContain("L ");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test.each(["visibilitychange", "focus"])(
    "%s revalidates after timers are suspended",
    async (event) => {
      await act(async () =>
        root.render(React.createElement(React.Fragment, null, renderPanel(), renderLabel())),
      );
      await flush();
      expect(container.textContent).toContain("Gate:");
      expect(fetch).toHaveBeenCalledTimes(2);
      vi.setSystemTime(deadline + 1);
      await act(async () =>
        (event === "focus" ? window : document).dispatchEvent(new Event(event)),
      );
      expect(container.textContent).not.toContain("Gate:");
      expect(container.textContent).toContain("?");
    },
  );
  test("an older response cannot replace the changed URL", async () => {
    let finish!: (response: Response) => void;
    const initialUrl = storybook.params.reportUrl;
    vi.stubGlobal(
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
    expect(container.textContent).toContain("Gate:");
    await act(async () => finish(new Response("not JSON")));
    expect(container.textContent).toContain("Gate:");
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(report))),
    );
    await act(async () =>
      root.render(React.createElement(React.Fragment, null, renderPanel(), renderLabel())),
    );
    await flush();
    expect(container.textContent).toContain("Gate:");
    await act(async () => vi.advanceTimersByTime(11));
    expect(container.textContent).not.toContain("Gate:");
    expect(container.textContent).toContain("release candidate snapshot");
    expect(container.textContent).toContain("?");
  });
  test("a timed out request cannot revive the panel when a fetch ignores abort", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
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
    expect(container.textContent).not.toContain("Gate:");
  });

  test("sidebar clears the old URL while its replacement is pending", async () => {
    storybook.params = { ...storybook.params, reportUrl: caseUrl("initial") };
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.endsWith("initial.json")
          ? Promise.resolve(response())
          : new Promise<Response>(() => {}),
      ),
    );
    await act(async () => root.render(renderLabel()));
    await flush();
    expect(container.textContent).toContain("L ");
    storybook.params = { ...storybook.params, reportUrl: caseUrl("pending") };
    await act(async () => root.render(renderLabel()));
    expect(container.textContent).not.toContain("L ");
    expect(container.textContent).toContain("?");
  });

  test("a superseded sidebar poll cannot replace the newer observation", async () => {
    vi.setSystemTime(Date.parse(at));
    storybook.params = { ...storybook.params, reportUrl: caseUrl("poll") };
    let finish!: (response: Response) => void;
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        ++calls === 1
          ? new Promise<Response>((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(response()),
      ),
    );
    await act(async () => root.render(renderLabel()));
    await act(async () => vi.advanceTimersByTime(60_000));
    await flush();
    expect(container.textContent).toContain("L ");
    await act(async () => finish(new Response("failure", { status: 500 })));
    expect(container.textContent).toContain("L ");
  });
  test("reload ignores the older request after a newer response wins", async () => {
    let finish!: (response: Response) => void;
    let calls = 0;
    vi.stubGlobal(
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
    expect(container.textContent).toContain("Gate:");
    await act(async () => finish(new Response("failure", { status: 500 })));
    expect(container.textContent).toContain("Gate:");
  });
  test("unmount aborts the request and ignores a late response", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetcher = vi.fn((_url: string, _options: RequestInit) => pending);
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(renderPanel()));
    await act(async () => root.render(null));
    expect(fetcher.mock.calls[0]?.[1].signal?.aborted).toBe(true);
    await act(async () => finish(response()));
    expect(container.textContent).toBe("");
  });
});
