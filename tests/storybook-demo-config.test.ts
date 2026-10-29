import { expect, test } from "vitest";
import config from "../apps/storybook-demo/.storybook/main.ts";

test("the root Storybook dogfoods the workspace Governator addon", () => {
  expect(config.addons).toContain("@opsydyn/storybook-addon-governator");
  expect(config.addons).not.toContain("governator-npm-addon");
});
