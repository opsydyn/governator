// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Discovery } from "../packages/storybook-addon/src/discovery.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
test("finds blocked and missing components using report decisions and owner search", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const decisions = [
    {
      componentId: "ui.button",
      package: "@example/ui",
      gate: "ready",
      lifecycle: "stable",
      owners: ["@design"],
      reasons: [],
    },
    {
      componentId: "ui.select",
      package: "@example/ui",
      gate: "blocked",
      lifecycle: "candidate",
      owners: ["@forms"],
      reasons: ["Accessibility check failed"],
    },
    {
      componentId: "ui.alert",
      package: "@example/ui",
      gate: "insufficient_evidence",
      lifecycle: "draft",
      owners: ["@core"],
      reasons: ["Evidence missing"],
    },
  ] as const;
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => root.render(React.createElement(Discovery, { decisions })));
  expect(el.textContent).toContain("2 readiness gates need attention");
  expect(el.textContent).toContain("ui.select");
  expect(el.textContent).toContain("ui.alert");
  expect(el.textContent).not.toContain("ui.button");
  const filter = el.querySelector<HTMLSelectElement>('select[aria-label="Readiness filter"]')!;
  await act(async () => {
    filter.value = "blocked";
    filter.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(el.textContent).toContain("ui.select");
  expect(el.textContent).not.toContain("ui.alert");
  const search = el.querySelector<HTMLInputElement>('input[aria-label="Search components"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(search, "@core");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(el.textContent).toContain("No components match");
  await act(async () => {
    filter.value = "all";
    filter.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(el.textContent).toContain("ui.alert");
  expect(el.textContent).not.toContain("ui.select");
  await act(async () => root.unmount());
});

test("large reports limit rendered entries without hiding searchable matches", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const decisions = Array.from({ length: 105 }, (_, i) => ({
    componentId: `ui.item-${i}`,
    package: "@example/ui",
    gate: "blocked" as const,
    lifecycle: "candidate" as const,
    owners: [],
    reasons: [],
  }));
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => root.render(React.createElement(Discovery, { decisions })));
  expect(el.textContent).toContain("105 matching components; showing first 100");
  expect(el.textContent).not.toContain("ui.item-104");
  const search = el.querySelector<HTMLInputElement>('input[aria-label="Search components"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(search, "ui.item-104");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(el.textContent).toContain("ui.item-104");
  await act(async () => root.unmount());
});

test("offers the explicitly mapped stories and navigates to the chosen story", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const decisions = [
    {
      componentId: "ui.select",
      package: "@example/ui",
      gate: "blocked" as const,
      lifecycle: "candidate" as const,
      owners: [],
      reasons: [],
    },
  ];
  const selectStory = vi.fn();
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () =>
    root.render(
      React.createElement(Discovery, {
        decisions,
        stories: {
          "ui.select": [{ id: "components-select--default", name: "Components/Select / Default" }],
        },
        selectStory,
      }),
    ),
  );
  const button = [...el.querySelectorAll("button")].find((item) =>
    item.textContent?.includes("Components/Select / Default"),
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
  expect(selectStory).toHaveBeenCalledWith("components-select--default");
  await act(async () => root.unmount());
});

test("announces when unsaved tag edits prevent opening another story", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const decisions = [
    {
      componentId: "ui.select",
      package: "@example/ui",
      gate: "blocked" as const,
      lifecycle: "candidate" as const,
      owners: [],
      reasons: [],
    },
  ];
  const selectStory = vi.fn(() => false);
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () =>
    root.render(
      React.createElement(Discovery, {
        decisions,
        stories: { "ui.select": [{ id: "select--one", name: "Select / One" }] },
        selectStory,
      }),
    ),
  );
  const button = [...el.querySelectorAll("button")].find((item) =>
    item.textContent?.includes("Select / One"),
  )!;
  await act(async () => button.click());
  expect(el.textContent).toContain("Save or discard your tag edits before opening another story");
  await act(async () => root.unmount());
});
