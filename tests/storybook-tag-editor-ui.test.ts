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
