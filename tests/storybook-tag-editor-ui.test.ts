// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TagEditor } from "../packages/storybook-addon/src/tag-editor-ui.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
test("allows a user to remove and save a component's descriptive tag", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes("index.json"))
      return new Response(
        JSON.stringify({
          entries: { "button--primary": { importPath: "./src/Button.stories.tsx" } },
        }),
      );
    if (init?.method === "POST") return new Response(JSON.stringify({ tags: [], revision: "new" }));
    return new Response(JSON.stringify({ tags: ["forms"], revision: "old" }));
  });
  vi.stubGlobal("fetch", fetchMock);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TagEditor, { storyId: "button--primary" }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const remove = [...container.querySelectorAll("button")].find(
    (item) => item.getAttribute("aria-label") === "Remove forms",
  );
  expect(remove).toBeDefined();
  await act(async () => remove!.click());
  const save = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === "Save tags",
  );
  expect(save).toBeDefined();
  await act(async () => {
    save!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const post = fetchMock.mock.calls.find((args) => args[1]?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({
    path: "./src/Button.stories.tsx",
    revision: "old",
    tags: [],
  });
  expect(container.textContent).toContain("Tags saved");
  await act(async () => root.unmount());
});

test("static Storybook shows declared story tags without pretending editing is available", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("index.json")
        ? new Response(
            JSON.stringify({
              entries: {
                "button--primary": {
                  importPath: "./src/Button.stories.tsx",
                  tags: ["dev", "forms"],
                },
              },
            }),
          )
        : new Response("missing", { status: 404 }),
    ),
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TagEditor, { storyId: "button--primary" }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(container.textContent).toContain("forms");
  expect(container.textContent).toContain("unavailable");
  expect(container.querySelector("input")).toBeNull();
  await act(async () => root.unmount());
});

test("a static SPA fallback does not masquerade as an enabled editor", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("index.json")
        ? new Response(
            JSON.stringify({
              entries: {
                "button--primary": { importPath: "./src/Button.stories.tsx", tags: ["forms"] },
              },
            }),
          )
        : new Response("<html>fallback</html>", { status: 200 }),
    ),
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TagEditor, { storyId: "button--primary" }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(container.textContent).toContain("Tag editing is unavailable");
  expect(container.textContent).toContain("forms");
  await act(async () => root.unmount());
});

test("removing focused tags preserves keyboard focus and announces each removal", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("index.json")
        ? new Response(
            JSON.stringify({
              entries: { "button--primary": { importPath: "./Button.stories.tsx" } },
            }),
          )
        : new Response(JSON.stringify({ tags: ["forms", "actions"], revision: "old" })),
    ),
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TagEditor, { storyId: "button--primary" }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const input = container.querySelector("input")!;
  const removeForms = container.querySelector<HTMLButtonElement>('[aria-label="Remove forms"]')!;
  removeForms.focus();
  await act(async () => removeForms.click());
  expect(document.activeElement).toBe(input);
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Removed forms");
  const removeActions = container.querySelector<HTMLButtonElement>(
    '[aria-label="Remove actions"]',
  )!;
  removeActions.focus();
  await act(async () => removeActions.click());
  expect(document.activeElement).toBe(input);
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Removed actions");
  await act(async () => root.unmount());
});

test("reloading after a save conflict keeps focus within the editor", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("index.json"))
        return new Response(
          JSON.stringify({
            entries: { "button--primary": { importPath: "./Button.stories.tsx" } },
          }),
        );
      if (init?.method === "POST") return new Response("{}", { status: 409 });
      return new Response(JSON.stringify({ tags: ["forms"], revision: "old" }));
    }),
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TagEditor, { storyId: "button--primary" }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Remove forms"]')!.click(),
  );
  await act(async () => {
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Save tags")!
      .click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const reload = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Discard draft and reload tags",
  )!;
  expect(reload).toBeDefined();
  reload.focus();
  await act(async () => {
    reload.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(
    container.querySelector('[aria-label="Descriptive tags"]')?.contains(document.activeElement),
  ).toBe(true);
  await act(async () => root.unmount());
});

test("reports unsaved edits and allows the user to discard them", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("index.json")
        ? new Response(
            JSON.stringify({
              entries: { "button--primary": { importPath: "./Button.stories.tsx" } },
            }),
          )
        : new Response(JSON.stringify({ tags: ["forms"], revision: "old" })),
    ),
  );
  const onDirtyChange = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TagEditor, { storyId: "button--primary", onDirtyChange }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Remove forms"]')!.click(),
  );
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  const discard = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Discard changes",
  )!;
  expect(discard).toBeDefined();
  await act(async () => discard.click());
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  expect(container.querySelector('[aria-label="Remove forms"]')).not.toBeNull();
  expect(container.textContent).toContain("Tag edits discarded");
  await act(async () => root.unmount());
});

test("restores an unsaved draft after the editor is unmounted and reopened", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("index.json")
        ? new Response(
            JSON.stringify({
              entries: { "button--primary": { importPath: "./Button.stories.tsx" } },
            }),
          )
        : new Response(JSON.stringify({ tags: ["forms", "actions"], revision: "old" })),
    ),
  );
  const drafts = new Map();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TagEditor, { storyId: "button--primary", drafts }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Remove forms"]')!.click(),
  );
  await act(async () => root.render(null));
  await act(async () => {
    root.render(React.createElement(TagEditor, { storyId: "button--primary", drafts }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(container.querySelector('[aria-label="Remove forms"]')).toBeNull();
  expect(container.querySelector('[aria-label="Remove actions"]')).not.toBeNull();
  expect(container.textContent).toContain("Unsaved tag edits restored");
  await act(async () => root.unmount());
});

test("restored drafts cannot overwrite a story changed since the draft was made", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let revision = "old";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("index.json")
        ? new Response(
            JSON.stringify({
              entries: { "button--primary": { importPath: "./Button.stories.tsx" } },
            }),
          )
        : new Response(
            JSON.stringify({ tags: revision === "old" ? ["forms"] : ["new-tag"], revision }),
          ),
    ),
  );
  const drafts = new Map();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TagEditor, { storyId: "button--primary", drafts }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Remove forms"]')!.click(),
  );
  await act(async () => root.render(null));
  revision = "new";
  await act(async () => {
    root.render(React.createElement(TagEditor, { storyId: "button--primary", drafts }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(container.textContent).toContain("Story changed");
  expect(container.textContent).toContain("Your draft is unsaved");
  expect(
    [...container.querySelectorAll("button")].find((button) => button.textContent === "Save tags")
      ?.disabled,
  ).toBe(true);
  const input = container.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      "review",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Add tag")!
      .click(),
  );
  expect(container.textContent).toContain("Your draft is unsaved");
  expect(container.textContent).toContain("Discard draft and reload tags");
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Discard changes")!
      .click(),
  );
  expect(container.querySelector('[aria-label="Remove new-tag"]')).not.toBeNull();
  await act(async () => root.unmount());
});

test("a save that completes after unmount clears only the submitted cached draft", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let finish!: (value: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("index.json"))
        return new Response(
          JSON.stringify({
            entries: { "button--primary": { importPath: "./Button.stories.tsx" } },
          }),
        );
      if (init?.method === "POST") return pending;
      return new Response(JSON.stringify({ tags: ["forms"], revision: "old" }));
    }),
  );
  const drafts = new Map();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TagEditor, { storyId: "button--primary", drafts }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Remove forms"]')!.click(),
  );
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Save tags")!
      .click(),
  );
  await act(async () => root.render(null));
  expect(drafts.size).toBe(1);
  await act(async () => {
    finish(new Response(JSON.stringify({ revision: "new" })));
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(drafts.size).toBe(0);
  await act(async () => root.unmount());
});

test("a completed older save does not clear a newer cached draft", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let finish!: (value: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("index.json"))
        return new Response(
          JSON.stringify({
            entries: { "button--primary": { importPath: "./Button.stories.tsx" } },
          }),
        );
      if (init?.method === "POST") return pending;
      return new Response(JSON.stringify({ tags: ["forms"], revision: "old" }));
    }),
  );
  const drafts = new Map();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TagEditor, { storyId: "button--primary", drafts }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Remove forms"]')!.click(),
  );
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Save tags")!
      .click(),
  );
  await act(async () => root.render(null));
  const newer = { ...drafts.get("button--primary"), draft: ["newer"] };
  drafts.set("button--primary", newer);
  await act(async () => {
    finish(new Response(JSON.stringify({ revision: "new" })));
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(drafts.get("button--primary")).toBe(newer);
  await act(async () => root.unmount());
});

test("keeps a draft when the story's source path changes and requires resolution", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let path = "./Old.stories.tsx";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("index.json")
        ? new Response(JSON.stringify({ entries: { "button--primary": { importPath: path } } }))
        : new Response(JSON.stringify({ tags: ["forms"], revision: "same" })),
    ),
  );
  const drafts = new Map();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TagEditor, { storyId: "button--primary", drafts }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Remove forms"]')!.click(),
  );
  await act(async () => root.render(null));
  path = "./New.stories.tsx";
  await act(async () => {
    root.render(React.createElement(TagEditor, { storyId: "button--primary", drafts }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(container.querySelector('[aria-label="Remove forms"]')).toBeNull();
  expect(container.textContent).toContain("Story changed");
  expect(
    [...container.querySelectorAll("button")].find((button) => button.textContent === "Save tags")
      ?.disabled,
  ).toBe(true);
  expect(drafts.size).toBe(1);
  await act(async () => root.unmount());
});
