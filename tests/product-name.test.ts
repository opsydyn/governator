import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const readManifest = (path: string) => JSON.parse(readFileSync(path, "utf8"));

test("Governator commands and package names agree across the workspace", () => {
  const root = readManifest("package.json");
  const cli = readManifest("packages/cli/package.json");
  const mcp = readManifest("packages/mcp/package.json");
  const addon = readManifest("packages/storybook-addon/package.json");
  expect(root.scripts.governator).toBeDefined();
  expect(cli.name).toBe("@opsydyn/governator-cli");
  expect(cli.bin.governator).toBe("./dist/main.mjs");
  expect(mcp.name).toBe("@opsydyn/governator-mcp");
  expect(mcp.bin["governator-mcp"]).toBe("./dist/main.mjs");
  expect(addon.name).toBe("@opsydyn/storybook-addon-governator");
  const help = execFileSync("bun", ["run", "governator", "--help"], { encoding: "utf8" });
  expect(help).toContain("governator validate");
});
