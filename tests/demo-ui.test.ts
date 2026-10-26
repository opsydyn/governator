import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, Select, Alert, LegacyAlert } from "../packages/demo-ui/src/index.ts";
describe("dogfood component contracts", () => {
  test("button renders an explicit accessible action and honors disabled", () => {
    const html = renderToStaticMarkup(
      createElement(Button, { label: "Save changes", disabled: true }),
    );
    expect(html).toContain("Save changes");
    expect(html).toContain('type="button"');
    expect(html).toContain('disabled=""');
  });
  test("select has a programmatically associated label and native options", () => {
    const html = renderToStaticMarkup(
      createElement(Select, {
        label: "Environment",
        options: [
          { value: "preview", label: "Preview" },
          { value: "production", label: "Production" },
        ],
      }),
    );
    const id = html.match(/<select[^>]*id="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain('value="preview"');
  });
  test("alerts preserve status semantics and legacy replacement content", () => {
    expect(renderToStaticMarkup(createElement(Alert, { message: "Changes saved" }))).toContain(
      'role="status"',
    );
    expect(
      renderToStaticMarkup(createElement(LegacyAlert, { message: "Legacy message" })),
    ).toContain("Legacy message");
  });
});
