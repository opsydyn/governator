import { expect, test } from "vitest";
import { inspectGithubReader } from "../scripts/github-review-boundaries.ts";
test("reader boundary rejects ambient network, credentials, Node HTTP and dynamic imports", () => {
  for (const source of [
    'fetch("https://example.invalid")',
    'globalThis["fetch"](url)',
    "process.env.GITHUB_TOKEN",
    'import http from "node:http"',
    'import("node:https")',
  ])
    expect(inspectGithubReader(source).length).toBeGreaterThan(0);
  expect(
    inspectGithubReader('import { Schema } from "effect"; request({redirect:"manual"});'),
  ).toEqual([]);
});
