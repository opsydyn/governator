import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("workspace typecheck waits for the addon editor declaration", () => {
  const config = Bun.YAML.parse(readFileSync("moon.yml", "utf8")) as {
    tasks: { typecheck: { deps: string[] } };
  };
  expect(config.tasks.typecheck.deps).toContain("storybook-addon:build");
});
