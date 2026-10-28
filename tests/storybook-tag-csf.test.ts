import { describe, expect, test } from "vitest";
import { editComponentTags } from "../packages/storybook-addon/src/tag-csf.ts";

describe("component tag editing", () => {
  test("updates only the component tags while keeping Storybook's built-in tags", () => {
    const source =
      'const meta = { title: "Button", tags: ["autodocs", "forms"] } satisfies Meta;\nexport default meta;\nexport const Primary = {};\n';
    const result = editComponentTags(source, "Button.stories.tsx", ["navigation", "forms"]);
    expect(result).toContain('tags: ["autodocs", "navigation", "forms"]');
    expect(result).toContain("export const Primary = {};");
  });
  test("refuses reserved tags and computed or dynamic metadata", () => {
    const dynamic = 'const meta = { title: "Button", tags: otherTags }; export default meta;';
    expect(() => editComponentTags(dynamic, "Button.stories.tsx", ["forms"])).toThrow();
    const source = 'export default { title: "Button", tags: ["forms"] };';
    expect(() => editComponentTags(source, "Button.stories.tsx", ["!test"])).toThrow();
    expect(() => editComponentTags(source, "Button.stories.tsx", ["test"])).toThrow();
    expect(() =>
      editComponentTags(source, "Button.stories.tsx", ["governator:component:ui-button"]),
    ).toThrow();
    const quoted = 'export default { title: "Button", "tags": ["forms"] };';
    expect(editComponentTags(quoted, "Button.stories.tsx", ["layout"])).toContain(
      '"tags": ["layout"]',
    );
  });
  test("does not produce invalid code when a comment follows a trailing comma", () => {
    const source = 'export default { title: "Button", // retained comment\n};';
    expect(() => editComponentTags(source, "Button.stories.tsx", ["forms"])).toThrow();
  });
});
