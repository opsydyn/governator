import { expect, test, vi } from "vitest";
import {
  loadStoryMap,
  storiesByComponent,
} from "../packages/storybook-addon/src/story-navigation.ts";

const index = {
  "button--primary": {
    type: "story",
    id: "button--primary",
    name: "Primary",
    title: "Button",
    importPath: "./Button.stories.tsx",
    exportName: "Primary",
  },
  "button--docs": {
    type: "docs",
    id: "button--docs",
    name: "Docs",
    title: "Button",
    importPath: "./Button.stories.tsx",
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

test("joins a validated source mapping to the current local story index", () => {
  expect(storiesByComponent(index, mapping)).toEqual({
    "ui.button": [{ id: "button--primary", name: "Button / Primary" }],
  });
});

test("loads the map from the local Storybook base without credentials or redirects", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify(mapping)));
  const controller = new AbortController();
  expect(
    await loadStoryMap(
      "https://example.test/docs/",
      "https://example.test",
      fetcher,
      controller.signal,
    ),
  ).toEqual(mapping);
  expect(fetcher).toHaveBeenCalledWith("https://example.test/docs/governator-story-map.json", {
    signal: controller.signal,
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
  });
  expect(
    await loadStoryMap("https://other.test/", "https://example.test", fetcher),
  ).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
test("rejects stale, ambiguous or untrusted mapping entries", () => {
  expect(storiesByComponent(index, { ...mapping, version: 2 })).toEqual({});
  expect(
    storiesByComponent(index, { version: 1, stories: [mapping.stories[0], mapping.stories[0]] }),
  ).toEqual({});
  expect(
    storiesByComponent(index, {
      version: 1,
      stories: [{ ...mapping.stories[0], exportName: "Other" }],
    }),
  ).toEqual({});
  expect(
    storiesByComponent(index, {
      version: 1,
      stories: [{ ...mapping.stories[0], importPath: "./Other.stories.tsx" }],
    }),
  ).toEqual({});
  expect(
    storiesByComponent(index, {
      version: 1,
      stories: [{ ...mapping.stories[0], id: "button--docs" }],
    }),
  ).toEqual({});
  expect(
    storiesByComponent(
      { ...index, "button--primary": { ...index["button--primary"], refId: "remote" } },
      mapping,
    ),
  ).toEqual({});
});
