import { expect, test } from "vitest";
import preview from "./preview";

test("the governance report follows the deployed Storybook base path", () => {
  const report = preview.parameters?.governance.reportUrl;
  expect(new URL(report, "https://example.com/governator/storybook/").pathname).toBe(
    "/governator/storybook/governance-report.json",
  );
  expect(new URL(report, "http://localhost:6006/").pathname).toBe("/governance-report.json");
});
