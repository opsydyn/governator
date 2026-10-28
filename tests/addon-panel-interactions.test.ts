// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { evaluate } from "../packages/core/src/index.ts";
import { at, evaluation } from "./fixtures.ts";

const storybook = vi.hoisted(() => ({
  params: { componentId: "ui.button", reportUrl: "/interactions.json" },
  storyId: undefined as string | undefined,
  renderPanel: undefined as undefined | ((props: { active: boolean }) => React.ReactNode),
}));
vi.mock("storybook/manager-api", () => ({
  addons: {
    register: (_name: string, callback: () => void) => callback(),
    getConfig: () => ({}),
    setConfig: () => {},
    add: (_name: string, panel: { render: (props: { active: boolean }) => React.ReactNode }) => {
      storybook.renderPanel = panel.render;
    },
  },
  types: { PANEL: "panel" },
  useParameter: () => storybook.params,
  useStorybookState: () => ({ storyId: storybook.storyId }),
  useStorybookApi: () => ({ selectStory: () => {} }),
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

const report = () => {
  const snapshot = evaluate(evaluation());
  return {
    ...snapshot,
    decisions: [...snapshot.decisions, { ...snapshot.decisions[0]!, componentId: "ui.select" }],
  };
};
const response = () => new Response(JSON.stringify(report()));
const deadline = Date.parse(at) + 24 * 60 * 60 * 1000;
let container: HTMLDivElement;
let root: Root;
let clipboardDescriptor: PropertyDescriptor | undefined;
let mounted: boolean;
const render = () => storybook.renderPanel?.({ active: true });
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
const liveText = () =>
  [...container.querySelectorAll('[role="status"], [role="alert"]')]
    .map((element) => element.textContent)
    .join(" ");
const button = (label: string) => {
  const result = [...container.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(label),
  );
  expect(result, `Missing button ${label}`).toBeDefined();
  return result!;
};
// happy-dom does not implement the browser's default keyboard-to-click activation.
const pressEnter = async (element: HTMLButtonElement) => {
  element.focus();
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    element.click();
    element.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
  });
};
const setClipboard = (writeText?: (value: string) => Promise<void>) => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const switchComponent = async (componentId: string) => {
  storybook.params = { ...storybook.params, componentId };
  await act(async () => root.render(render()));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(at));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response()),
  );
  storybook.params = { componentId: "ui.button", reportUrl: "/interactions.json" };
  storybook.storyId = undefined;
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mounted = true;
});
afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  container.remove();
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("panel interactions", () => {
  test("offers descriptive tags even when governance identity is not configured", async () => {
    storybook.params = { componentId: "", reportUrl: "" };
    storybook.storyId = "button--primary";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        String(url).includes("index.json")
          ? new Response(
              JSON.stringify({
                entries: { "button--primary": { importPath: "./Button.stories.tsx" } },
              }),
            )
          : new Response(JSON.stringify({ tags: ["forms"], revision: "abc" })),
      ),
    );
    await act(async () => root.render(render()));
    await flush();
    expect(container.textContent).toContain("Descriptive tags");
    expect(container.textContent).toContain("forms");
  });
  test("keyboard reload retains a usable focused control through loading, error and recovery", async () => {
    const retry = deferred<Response>();
    const recovery = deferred<Response>();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        ++calls === 1
          ? Promise.resolve(response())
          : calls === 2
            ? retry.promise
            : recovery.promise,
      ),
    );
    await act(async () => root.render(render()));
    await flush();
    expect(container.textContent).toContain("Gate:");
    await pressEnter(button("Reload report"));
    expect(document.activeElement).toBe(button("Reload report"));
    expect(button("Reload report").disabled).toBe(false);
    expect(liveText()).toMatch(/loading/i);
    await act(async () => retry.resolve(new Response("failed", { status: 500 })));
    await flush();
    expect(document.activeElement).toBe(button("Reload report"));
    expect(liveText()).toMatch(/unverified|could not|error/i);
    await pressEnter(button("Reload report"));
    expect(document.activeElement).toBe(button("Reload report"));
    await act(async () => recovery.resolve(response()));
    await flush();
    expect(document.activeElement).toBe(button("Reload report"));
    expect(container.textContent).toContain("Gate:");
    expect(liveText()).toMatch(/loaded|ready|current/i);
  });

  test("automatic expiry announces the unverified state without moving focus to reload", async () => {
    vi.setSystemTime(deadline - 1);
    await act(async () => root.render(render()));
    await flush();
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    await act(async () => vi.advanceTimersByTime(2));
    expect(document.activeElement).toBe(outside);
    expect(liveText()).toMatch(/older than 24 hours/i);
    outside.remove();
  });

  test.each(["copy", "disclosure"])(
    "expiry restores focus from removed %s to reload",
    async (target) => {
      vi.setSystemTime(deadline - 1);
      const candidate = {
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
        reasons: ["Removed public tone prop requires major"],
        remediation: ["Declare a major migration"],
        publishable: false,
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ ...report(), release: candidate }))),
      );
      await act(async () => root.render(render()));
      await flush();
      const focused = target === "copy" ? button("Copy ID") : container.querySelector("summary");
      expect(focused).not.toBeNull();
      (focused as HTMLElement).focus();
      expect(document.activeElement).toBe(focused);
      await act(async () => vi.advanceTimersByTime(2));
      expect(liveText()).toMatch(/stale|older than 24 hours/i);
      expect(document.activeElement).toBe(button("Reload report"));
    },
  );

  test("an asynchronous report change does not reclaim focus after the user moves outside", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(response()).mockReturnValueOnce(pending.promise),
    );
    await act(async () => root.render(render()));
    await flush();
    button("Copy ID").focus();
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    storybook.params = { ...storybook.params, reportUrl: "/another.json" };
    await act(async () => root.render(render()));
    expect(document.activeElement).toBe(outside);
    await act(async () => pending.resolve(new Response("failure", { status: 500 })));
    await flush();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  test("a changed report URL restores focus when it removes the focused copy control", async () => {
    await act(async () => root.render(render()));
    await flush();
    button("Copy ID").focus();
    storybook.params = { ...storybook.params, reportUrl: "/another.json" };
    await act(async () => root.render(render()));
    expect(document.activeElement).toBe(button("Reload report"));
  });

  test("unmapped components can reload and show a newly available decision", async () => {
    const initial = evaluate(evaluation());
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(++calls === 1 ? initial : report()))),
    );
    storybook.params = { ...storybook.params, componentId: "ui.select" };
    await act(async () => root.render(render()));
    await flush();
    expect(container.textContent).toContain("No registry decision");
    await pressEnter(button("Reload report"));
    await flush();
    expect(container.textContent).toContain("Gate:");
    expect(container.textContent).toContain("ui.select");
    expect(document.activeElement).toBe(button("Reload report"));
  });

  test("copy success reports the copied current ID", async () => {
    const writes: string[] = [];
    setClipboard(async (value) => {
      writes.push(value);
    });
    await act(async () => root.render(render()));
    await flush();
    await pressEnter(button("Copy ID"));
    await flush();
    expect(writes).toEqual(["ui.button"]);
    expect(container.textContent).toMatch(/copied/i);
  });

  test("completed copy feedback resets when the component changes", async () => {
    setClipboard(async () => {});
    await act(async () => root.render(render()));
    await flush();
    await pressEnter(button("Copy ID"));
    await flush();
    expect(container.textContent).toMatch(/copied/i);
    await switchComponent("ui.select");
    expect(button("Copy ID")).toBeDefined();
    expect(container.textContent).not.toMatch(/copied id/i);
  });

  test.each(["rejected", "missing"])(
    "copy %s exposes failure rather than success",
    async (mode) => {
      setClipboard(
        mode === "rejected"
          ? async () => {
              throw new Error("denied");
            }
          : undefined,
      );
      await act(async () => root.render(render()));
      await flush();
      await pressEnter(button("Copy ID"));
      await flush();
      expect(container.textContent).not.toMatch(/copied id/i);
      expect(liveText()).toMatch(/copy|clipboard/i);
    },
  );

  test.each(["resolve", "reject"])("old copy %s cannot update a new component", async (settle) => {
    const pending = deferred<void>();
    setClipboard(() => pending.promise);
    await act(async () => root.render(render()));
    await flush();
    await pressEnter(button("Copy ID"));
    await switchComponent("ui.select");
    expect(container.textContent).toContain("ui.select");
    await act(async () =>
      settle === "resolve" ? pending.resolve() : pending.reject(new Error("denied")),
    );
    await flush();
    expect(button("Copy ID")).toBeDefined();
    expect(container.textContent).not.toMatch(
      /copied id|copy failed|clipboard.*(failed|unavailable)/i,
    );
  });

  test("a copy from before switching away cannot update the original component after returning", async () => {
    const pending = deferred<void>();
    setClipboard(() => pending.promise);
    await act(async () => root.render(render()));
    await flush();
    await pressEnter(button("Copy ID"));
    await switchComponent("ui.select");
    await switchComponent("ui.button");
    await act(async () => pending.resolve());
    await flush();
    expect(button("Copy ID")).toBeDefined();
    expect(container.textContent).not.toMatch(/copied id/i);
  });

  test("a copy completion after unmount is ignored", async () => {
    const pending = deferred<void>();
    setClipboard(() => pending.promise);
    await act(async () => root.render(render()));
    await flush();
    await pressEnter(button("Copy ID"));
    await act(async () => root.unmount());
    mounted = false;
    await act(async () => pending.reject(new Error("denied")));
    await flush();
    expect(container.textContent).toBe("");
  });
});

test("v1 renders explicitly unknown evidence details", async () => {
  await act(async () => root.render(render()));
  await flush();
  expect(container.textContent).toContain("Producer (reported): unknown");
  expect(container.textContent).toContain("Source: unknown");
});

test.each([
  undefined,
  "artifacts/results.json",
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "https://user:secret@example.com/result",
  "https://example.com/result",
])("renders reported v2 provenance and safe source %s", async (sourceUrl) => {
  const input = evaluation();
  input.evidence[0]!.observedAt = "2026-10-26T11:58:30.000Z";
  if (sourceUrl) Object.assign(input.evidence[0]!, { sourceUrl });
  const snapshot = evaluate(input, 2);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(snapshot))),
  );
  await act(async () => root.render(render()));
  await flush();
  expect(container.textContent).toContain("Producer (reported): vitest");
  expect(container.textContent).toContain("Provenance (reported): demo");
  expect(container.textContent).toContain(input.evidence[0]!.observedAt);
  expect(container.textContent).toContain("Age at evaluation:");
  expect(container.textContent).toContain(sourceUrl ?? "Source: unknown");
  const links = container.querySelectorAll("a");
  expect(links.length).toBe(sourceUrl === "https://example.com/result" ? 1 : 0);
  if (links[0]) {
    expect(links[0].getAttribute("href")).toBe(sourceUrl);
    links[0].focus();
    expect(document.activeElement).toBe(links[0]);
  }
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("[data-evidence-age]")?.textContent).toBe(
    "Age at evaluation: 90 seconds",
  );
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(container.querySelector("[data-evidence-age]")?.textContent).toBe(
    "Age at evaluation: 90 seconds",
  );
});

test("v2 evidence disappears on report expiry and reload recovers a current snapshot", async () => {
  const input = evaluation();
  const snapshot = evaluate(input, 2);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(snapshot))),
  );
  await act(async () => root.render(render()));
  await flush();
  expect(container.textContent).toContain("Producer (reported): vitest");
  await act(async () => vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1));
  expect(container.textContent).toContain("older than 24 hours");
  expect(container.textContent).not.toContain("Producer (reported): vitest");
  const fresh = { ...snapshot, evaluatedAt: new Date().toISOString() };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(fresh))),
  );
  await pressEnter(button("Reload report"));
  await flush();
  expect(container.textContent).toContain("Producer (reported): vitest");
  expect(document.activeElement).toBe(button("Reload report"));
});
