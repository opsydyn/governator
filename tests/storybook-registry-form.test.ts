import { expect, test } from "vitest";
import {
  buildRegistryComponent,
  valuesOfRegistryComponent,
} from "../packages/storybook-addon/src/registry-form.ts";

const component = {
  id: "ui.button",
  name: "Button",
  package: "@example/ui",
  owners: ["@design-system"],
  lifecycle: "candidate",
  source: "src/Button.tsx",
  stories: ["src/Button.stories.tsx"],
  contractVersion: "1.0.0",
  exportPath: ".",
};

test("returns field-specific guidance without constructing an invalid declaration", () => {
  const values = {
    ...valuesOfRegistryComponent(component),
    owners: "",
    source: "../outside.tsx",
    stories: "/absolute.stories.tsx",
    contractVersion: "1",
    packageVersion: "latest",
    documentationUrl: "docs/button",
    figmaUrl: "javascript:alert(1)",
  };
  const result = buildRegistryComponent(component, values);
  expect(result.component).toBeUndefined();
  expect(result.fieldErrors).toEqual({
    contractVersion: "Use a complete semantic version such as 1.2.3 or 1.2.3-rc.1.",
    documentationUrl: "Use an absolute HTTP or HTTPS URL.",
    figmaUrl: "Use an absolute HTTP or HTTPS URL.",
    owners: "Add at least one owner, one per line.",
    packageVersion: "Use a complete semantic version such as 1.2.3 or 1.2.3-rc.1.",
    source: "Use a repository-relative path without dot-dot segments or backslashes.",
    stories: "Use repository-relative paths without dot-dot segments or backslashes.",
  });
});

test("preserves untouched unusual values while normalising fields the user changed", () => {
  const unusual = { ...component, owners: ["design\nops", "  team  "] };
  const values = { ...valuesOfRegistryComponent(unusual), name: "Action Button" };
  const result = buildRegistryComponent(unusual, values);
  expect(result.fieldErrors).toEqual({});
  expect(result.component).toEqual({ ...unusual, name: "Action Button" });
});
