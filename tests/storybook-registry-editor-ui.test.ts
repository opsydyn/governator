// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { RegistryEditor } from "../packages/storybook-addon/src/registry-editor-ui.tsx";

test("a maintainer can edit a declared name and save it without changing the component ID", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const component = {
    id: "ui.button",
    name: "Button",
    package: "ui",
    owners: ["team"],
    lifecycle: "candidate",
    source: "src/Button.tsx",
    stories: ["src/Button.stories.tsx"],
    contractVersion: "1.0.0-rc.1",
    exportPath: "ui",
  };
  let saved: any;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        saved = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ component: saved.component, revision: "new" }));
      }
      return new Response(JSON.stringify({ component, revision: "old" }));
    }),
  );
  let invalidated = false;
  const changed = () => {
    invalidated = true;
  };
  window.addEventListener("governator:registry-changed", changed);
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      React.createElement(RegistryEditor, { storyId: "button--one", componentId: "ui.button" }),
    );
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  const input = el.querySelector<HTMLInputElement>('input[aria-label="Name"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, "Action Button");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = [...el.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Save metadata"),
  )!;
  await act(async () => {
    save.click();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  expect(saved.component.name).toBe("Action Button");
  expect(saved.component.id).toBe("ui.button");
  expect(saved.revision).toBe("old");
  expect(invalidated).toBe(true);
  expect(el.textContent).toMatch(/regenerate/i);
  expect(el.textContent).toContain("configured registry file");
  await act(async () => root.unmount());
  el.remove();
  window.removeEventListener("governator:registry-changed", changed);
  vi.unstubAllGlobals();
});

test("invalid metadata links a field-specific summary to the exact control", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const component = {
    id: "ui.validation",
    name: "Validation",
    package: "ui",
    owners: ["team"],
    lifecycle: "candidate",
    source: "src/Validation.tsx",
    stories: ["src/Validation.stories.tsx"],
    contractVersion: "1.0.0",
    exportPath: "ui",
  };
  let posts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === "POST") posts++;
      return new Response(
        JSON.stringify({ component, revision: "old", registryPath: "governance/components.yaml" }),
      );
    }),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      React.createElement(RegistryEditor, {
        storyId: "validation--one",
        componentId: "ui.validation",
      }),
    );
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  expect(el.textContent).toContain("governance/components.yaml");
  expect(el.textContent).toContain("Contracts and paths");
  const contract = el.querySelector<HTMLInputElement>('[aria-label="Contract version"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(contract, "1");
    contract.dispatchEvent(new Event("input", { bubbles: true }));
    [...el.querySelectorAll("button")]
      .find((item) => item.textContent?.includes("Save metadata"))!
      .click();
  });
  const summary = el.querySelector('[role="alert"]')!;
  expect(summary.textContent).toContain("complete semantic version");
  expect(summary.querySelector('a[href="#gn-registry-contractVersion"]')).not.toBeNull();
  expect(contract.getAttribute("aria-invalid")).toBe("true");
  expect(posts).toBe(0);
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

test("a conflict keeps the unsaved draft while the user loads and reviews current metadata", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const component = {
    id: "ui.select",
    name: "Select",
    package: "ui",
    owners: ["team"],
    lifecycle: "candidate",
    source: "src/Select.tsx",
    stories: ["src/Select.stories.tsx"],
    contractVersion: "1.0.0-rc.1",
    exportPath: "ui",
  };
  let current = component;
  let revision = "old";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ error: "changed" }), { status: 409 })
        : new Response(JSON.stringify({ component: current, revision })),
    ),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      React.createElement(RegistryEditor, { storyId: "select--one", componentId: "ui.select" }),
    );
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  const input = el.querySelector<HTMLInputElement>('input[aria-label="Name"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      "Changed Select",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = [...el.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Save metadata"),
  )!;
  await act(async () => {
    save.click();
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  expect(el.textContent).toMatch(/registry changed/i);
  expect(input.value).toBe("Changed Select");
  expect(save.disabled).toBe(true);
  expect(el.textContent).toContain("Your intended declaration is preserved");
  expect(el.textContent).toContain("Copy intended declaration");
  current = { ...component, name: "Changed elsewhere" };
  revision = "new";
  const load = [...el.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Load current registry"),
  )!;
  await act(async () => {
    load.click();
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  expect(el.textContent).toContain("Changed elsewhere");
  const reapply = [...el.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Reapply draft to current registry"),
  )!;
  await act(async () => {
    reapply.click();
    for (let i = 0; i < 4; i++) await Promise.resolve();
  });
  expect(el.querySelector<HTMLInputElement>('input[aria-label="Name"]')!.value).toBe(
    "Changed Select",
  );
  expect(
    [...el.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Save metadata"),
    )!.disabled,
  ).toBe(false);
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

test("editing a name preserves unusual untouched owner declarations", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const component = {
    id: "ui.alert",
    name: "Alert",
    package: "ui",
    owners: ["design\nops", "  team  "],
    lifecycle: "candidate",
    source: "src/Alert.tsx",
    stories: ["src/Alert.stories.tsx"],
    contractVersion: "1.0.0-rc.1",
    exportPath: "ui",
  };
  let saved: any;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        saved = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ component: saved.component, revision: "new" }));
      }
      return new Response(JSON.stringify({ component, revision: "old" }));
    }),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      React.createElement(RegistryEditor, { storyId: "alert--one", componentId: "ui.alert" }),
    );
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  const input = el.querySelector<HTMLInputElement>('input[aria-label="Name"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      "New name",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = [...el.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Save metadata"),
  )!;
  await act(async () => {
    save.click();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  expect(saved.component.owners).toEqual(["design\nops", "  team  "]);
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

test("an earlier save cannot erase a newer draft after navigating away and back", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const original = {
    id: "ui.race",
    name: "Original",
    package: "ui",
    owners: ["team"],
    lifecycle: "candidate",
    source: "src/Race.tsx",
    stories: ["src/Race.stories.tsx"],
    contractVersion: "1.0.0-rc.1",
    exportPath: "ui",
  };
  let current = original;
  let revision = "old";
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? pending
        : new Response(JSON.stringify({ component: current, revision })),
    ),
  );
  const el = document.createElement("div");
  document.body.append(el);
  let root = createRoot(el);
  const render = async () => {
    await act(async () => {
      root.render(
        React.createElement(RegistryEditor, { storyId: "race--one", componentId: "ui.race" }),
      );
      for (let i = 0; i < 12; i++) await Promise.resolve();
    });
  };
  const edit = async (value: string) => {
    const input = el.querySelector<HTMLInputElement>('input[aria-label="Name"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  await render();
  await edit("First");
  const save = [...el.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Save metadata"),
  )!;
  await act(async () => {
    save.click();
    await Promise.resolve();
  });
  await act(async () => root.unmount());
  root = createRoot(el);
  await render();
  await edit("Newer draft");
  current = { ...original, name: "First" };
  revision = "new";
  await act(async () => {
    finish(new Response(JSON.stringify({ component: current, revision })));
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  await act(async () => root.unmount());
  root = createRoot(el);
  await render();
  expect(el.querySelector<HTMLInputElement>('input[aria-label="Name"]')!.value).toBe("Newer draft");
  expect(el.textContent).toMatch(/registry changed/i);
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

test("a stalled editor load times out and offers retry", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      React.createElement(RegistryEditor, { storyId: "timeout--one", componentId: "ui.timeout" }),
    );
    await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(10_001);
    await Promise.resolve();
  });
  expect(el.textContent).toMatch(/timed out/i);
  expect(
    [...el.querySelectorAll("button")].some((button) => button.textContent?.includes("Retry")),
  ).toBe(true);
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("a stalled save keeps the draft and reports that the outcome is unknown", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const component = {
    id: "ui.hung",
    name: "Original",
    package: "ui",
    owners: ["team"],
    lifecycle: "candidate",
    source: "src/Hung.tsx",
    stories: ["src/Hung.stories.tsx"],
    contractVersion: "1.0.0-rc.1",
    exportPath: "ui",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? new Promise<Response>(() => {})
        : new Response(JSON.stringify({ component, revision: "old" })),
    ),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      React.createElement(RegistryEditor, { storyId: "hung--one", componentId: "ui.hung" }),
    );
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  const input = el.querySelector<HTMLInputElement>('input[aria-label="Name"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Draft");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = [...el.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Save metadata"),
  )!;
  await act(async () => {
    save.click();
    await Promise.resolve();
    vi.advanceTimersByTime(10_001);
    await Promise.resolve();
  });
  expect(el.textContent).toMatch(/outcome.*unknown/i);
  expect(input.value).toBe("Draft");
  expect(save.disabled).toBe(true);
  expect(el.textContent).toContain("Your intended declaration is preserved");
  expect(el.textContent).toContain("Copy intended declaration");
  expect(
    [...el.querySelectorAll("button")].some((button) =>
      button.textContent?.includes("Load current registry"),
    ),
  ).toBe(true);
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("warns before leaving only while declared metadata is dirty", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const component = {
    id: "ui.leave",
    name: "Leave",
    package: "ui",
    owners: ["team"],
    lifecycle: "candidate",
    source: "src/Leave.tsx",
    stories: ["src/Leave.stories.tsx"],
    contractVersion: "1.0.0",
    exportPath: "ui",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ component, revision: "old" }))),
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      React.createElement(RegistryEditor, { storyId: "leave--basic", componentId: "ui.leave" }),
    );
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  const clean = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  const input = el.querySelector<HTMLInputElement>('input[aria-label="Name"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Draft");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const dirty = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(dirty);
  expect(dirty.defaultPrevented).toBe(true);
  await act(async () => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

test("a completed save invalidates report state again after the request began", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const component = {
    id: "ui.complete",
    name: "Original",
    package: "ui",
    owners: ["team"],
    lifecycle: "candidate",
    source: "src/Complete.tsx",
    stories: ["src/Complete.stories.tsx"],
    contractVersion: "1.0.0-rc.1",
    exportPath: "ui",
  };
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? pending
        : new Response(JSON.stringify({ component, revision: "old" })),
    ),
  );
  let changes = 0;
  const listener = () => {
    changes++;
  };
  window.addEventListener("governator:registry-changed", listener);
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      React.createElement(RegistryEditor, { storyId: "complete--one", componentId: "ui.complete" }),
    );
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  const input = el.querySelector<HTMLInputElement>('input[aria-label="Name"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      "Changed",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = [...el.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Save metadata"),
  )!;
  await act(async () => {
    save.click();
    await Promise.resolve();
  });
  expect(changes).toBe(1);
  await act(async () => {
    finish(
      new Response(
        JSON.stringify({ component: { ...component, name: "Changed" }, revision: "new" }),
      ),
    );
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
  expect(changes).toBe(2);
  await act(async () => root.unmount());
  el.remove();
  window.removeEventListener("governator:registry-changed", listener);
  vi.unstubAllGlobals();
});
