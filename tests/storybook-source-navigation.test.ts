import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { identitiesFromCsf, wrapIndexers } from "../packages/storybook-addon/src/story-index.ts";
import { storiesByComponent } from "../packages/storybook-addon/src/story-navigation.ts";

describe("source-backed story identities", () => {
  test("reads literal component identities and story-level overrides", () => {
    const source = `const meta = { title: 'Controls/Button', parameters: { governance: { componentId: 'ui.button' } } }; export default meta;
      export const Primary = {};
      export const Other = { parameters: { governance: { componentId: 'ui.other' } } };`;
    expect(identitiesFromCsf(source, "Button.stories.tsx", ["Primary", "Other"])).toEqual({
      Primary: "ui.button",
      Other: "ui.other",
    });
  });
  test("does not infer identities from dynamic or ambiguous metadata", () => {
    const source = `export default { title: 'Controls/Button', parameters: { governance: { componentId: 'ui.button' } } };
      export const Dynamic = { parameters: getParams() };
      export const Spread = { ...something };
      export const Explicit = { parameters: { governance: { componentId: 'ui.other' } } };`;
    expect(
      identitiesFromCsf(source, "Button.stories.tsx", ["Dynamic", "Spread", "Explicit"]),
    ).toEqual({
      Explicit: "ui.other",
    });
  });
  test("does not trust metadata passed to a function that could mutate it", () => {
    const source = `const meta = { title: 'Button', parameters: { governance: { componentId: 'ui.button' } } };
      Object.assign(meta, { parameters: getOtherParameters() }); export default meta; export const Primary = {};`;
    expect(identitiesFromCsf(source, "Button.stories.tsx", ["Primary"])).toEqual({});
  });
});

test("navigation uses only unambiguous local story index entries", () => {
  expect(
    storiesByComponent({
      a: {
        type: "story",
        id: "a",
        title: "A",
        name: "Primary",
        tags: ["governator:component:ui.button"],
      },
      b: {
        type: "docs",
        id: "b",
        title: "B",
        name: "Docs",
        tags: ["governator:component:ui.button"],
      },
      c: {
        type: "story",
        id: "c",
        title: "C",
        name: "Bad",
        tags: ["governator:component:ui.button", "governator:component:ui.other"],
      },
      d: {
        type: "story",
        id: "d",
        title: "D",
        name: "Ref",
        refId: "remote",
        tags: ["governator:component:ui.button"],
      },
    }),
  ).toEqual({ "ui.button": [{ id: "a", name: "A / Primary" }] });
});

test("the index derives markers from CSF and discards source-provided reserved markers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "governator-index-"));
  try {
    const file = join(directory, "Button.stories.tsx");
    await writeFile(
      file,
      `export default { title: 'Button', parameters: { governance: { componentId: 'ui.button' } } }; export const Primary = {};`,
    );
    const indexers = wrapIndexers([
      {
        test: /stories\.tsx$/,
        createIndex: async () => [
          { type: "story", exportName: "Primary", tags: ["stable", "governator:component:wrong"] },
        ],
      },
    ]);
    const entries = await indexers[0]!.createIndex(file, { makeTitle: () => "Button" });
    expect(entries[0]!.tags).toEqual(["stable", "governator:component:ui.button"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an unmapped story named like an object prototype does not gain a marker", async () => {
  const directory = await mkdtemp(join(tmpdir(), "governator-index-"));
  try {
    const file = join(directory, "Example.stories.tsx");
    await writeFile(file, `export default { title: 'Example' }; export const Primary = {};`);
    const indexers = wrapIndexers([
      {
        test: /stories\.tsx$/,
        createIndex: async () => [{ type: "story", exportName: "toString", tags: [] }],
      },
    ]);
    const entries = await indexers[0]!.createIndex(file, { makeTitle: () => "Example" });
    expect(entries[0]!.tags).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
