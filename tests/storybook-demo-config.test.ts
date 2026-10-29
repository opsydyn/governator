import { expect, test } from "vitest";
import config from "../apps/storybook-demo/.storybook/main.ts";
import manifest from "../apps/storybook-demo/package.json";

test("the root Storybook dogfoods the workspace Governator addon", () => {
  expect(config.addons).toContain("@opsydyn/storybook-addon-governator");
  expect(config.addons).not.toContain("governator-npm-addon");
  expect(manifest.dependencies["@opsydyn/storybook-addon-governator"]).toBe("workspace:*");
  expect(manifest.dependencies["governator-npm-cli"]).toBe("npm:@opsydyn/governator-cli@0.1.0");
  expect(manifest.dependencies["governator-npm-mcp"]).toBe("npm:@opsydyn/governator-mcp@0.1.0");
  expect(manifest.scripts["governator:npm"]).toContain("governator-npm-cli");
  expect(manifest.scripts["mcp:npm"]).toContain("governator-npm-mcp");
});
