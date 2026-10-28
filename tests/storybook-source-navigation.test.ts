import { mkdtemp, writeFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  identitiesFromCsf,
  storyMapFromIndex,
  wrapIndexers,
} from "../packages/storybook-addon/src/story-index.ts";

describe("source-backed story identities", () => {
  test("maps direct function and arrow-function stories to literal component metadata", () => {
    const source = `export default { title: 'Button', parameters: { governance: { componentId: 'ui.button' } } };
      export const Primary = () => null;
      export function Secondary() { return null; }`;
    expect(identitiesFromCsf(source, "Button.stories.tsx", ["Primary", "Secondary"])).toEqual({
      Primary: "ui.button",
      Secondary: "ui.button",
    });
  });
  test("does not map function stories whose metadata is assigned after declaration", () => {
    const source = `export default { title: 'Button', parameters: { governance: { componentId: 'ui.button' } } };
      export const Primary = () => null;
      Primary.parameters = { governance: { componentId: 'ui.other' } };`;
    expect(identitiesFromCsf(source, "Button.stories.tsx", ["Primary"])).toEqual({});
  });
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
    ).toEqual({});
  });
  test("does not trust metadata passed to a function that could mutate it", () => {
    const source = `const meta = { title: 'Button', parameters: { governance: { componentId: 'ui.button' } } };
      Object.assign(meta, { parameters: getOtherParameters() }); export default meta; export const Primary = {};`;
    expect(identitiesFromCsf(source, "Button.stories.tsx", ["Primary"])).toEqual({});
    const assigned = `const meta = { title: 'Button', parameters: { governance: { componentId: 'ui.button' } } };
      const changed = Object.assign(meta, { parameters: getOtherParameters() }); export default meta; export const Primary = {};`;
    expect(identitiesFromCsf(assigned, "Button.stories.tsx", ["Primary"])).toEqual({});
    const conditional = `const meta = { title: 'Button', parameters: { governance: { componentId: 'ui.button' } } };
      if (true) Object.assign(meta, { parameters: getOtherParameters() }); export default meta; export const Primary = {};`;
    expect(identitiesFromCsf(conditional, "Button.stories.tsx", ["Primary"])).toEqual({});
    const tagged = `const meta = { title: 'Button', parameters: { governance: { componentId: 'ui.button' } } };
      const mutate = () => Object.assign(meta, { parameters: getOtherParameters() }); mutate\`x\`; export default meta; export const Primary = {};`;
    expect(identitiesFromCsf(tagged, "Button.stories.tsx", ["Primary"])).toEqual({});
  });
});

test("indexes source identities without adding tags and refuses changed or deleted source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "governator-index-"));
  try {
    const file = join(directory, "Button.story.tsx");
    const source = `export default { title: 'Button', parameters: { governance: { componentId: 'ui.button' } } }; export const Primary = {};`;
    await writeFile(file, source);
    const indexers = wrapIndexers([
      {
        test: /story\.tsx$/,
        createIndex: async () => [{ type: "story", exportName: "Primary", tags: ["stable"] }],
      },
    ]);
    const entries = await indexers[0]!.createIndex(file, { makeTitle: () => "Button" });
    expect(entries[0]!.tags).toEqual(["stable"]);
    const entry = {
      id: "button--primary",
      type: "story",
      subtype: "story",
      importPath: "./Button.story.tsx",
      exportName: "Primary",
    };
    const index = { entries: { "button--primary": entry } };
    expect((await storyMapFromIndex(index, directory)).stories).toEqual([
      {
        id: entry.id,
        componentId: "ui.button",
        importPath: entry.importPath,
        exportName: entry.exportName,
      },
    ]);
    expect(
      (
        await storyMapFromIndex(
          {
            entries: {
              "button--primary": entry,
              "button--other": { ...entry, id: "button--other" },
            },
          },
          directory,
        )
      ).stories,
    ).toEqual([]);
    await writeFile(file, source.replace("ui.button", "ui.other"));
    expect((await storyMapFromIndex(index, directory)).stories).toEqual([]);
    await unlink(file);
    expect((await storyMapFromIndex(index, directory)).stories).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a source edit during indexing cannot publish an outdated mapping", async () => {
  const directory = await mkdtemp(join(tmpdir(), "governator-index-"));
  try {
    const file = join(directory, "Button.stories.tsx");
    await writeFile(
      file,
      `export default { title: 'Button', parameters: { governance: { componentId: 'ui.button' } } }; export const Primary = {};`,
    );
    async function mutateSource() {
      await writeFile(
        file,
        `export default { title: 'Button', parameters: { governance: { componentId: 'ui.other' } } }; export const Primary = {};`,
      );
      return [{ type: "story" as const, exportName: "Primary" }];
    }
    const indexers = wrapIndexers([
      {
        test: /stories\.tsx$/,
        createIndex: mutateSource,
      },
    ]);
    await indexers[0]!.createIndex(file, { makeTitle: () => "Button" });
    expect(
      (
        await storyMapFromIndex(
          {
            entries: {
              "button--primary": {
                id: "button--primary",
                type: "story",
                importPath: "./Button.stories.tsx",
                exportName: "Primary",
              },
            },
          },
          directory,
        )
      ).stories,
    ).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
