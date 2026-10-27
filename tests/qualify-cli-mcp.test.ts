import { expect, test, vi } from "vitest";
import { ChildProcess } from "node:child_process";
import {
  assertLocalResolutions,
  assertConventionalDependencies,
  launchRegistry,
  type RegistrySpawner,
} from "../scripts/qualify-cli-mcp.ts";

test("consumer lock permits only its exact loopback registry and candidate archives", () => {
  const registry = "http://127.0.0.1:12345";
  const candidates = ["file:/private/tmp/cli.tgz"];
  expect(() =>
    assertLocalResolutions(
      { packages: { a: { resolved: registry + "/x" }, b: { resolved: candidates[0] } } },
      registry,
      candidates,
    ),
  ).not.toThrow();
  for (const resolved of [
    "https://registry.npmjs.org/a",
    "http://localhost:12345/x",
    "http://127.0.0.1:12346/x",
    "file:/private/tmp/other.tgz",
    "git+https://example.invalid/a",
  ]) {
    expect(() =>
      assertLocalResolutions({ packages: { a: { resolved } } }, registry, candidates),
    ).toThrow();
  }
});

test("candidate runtime dependencies cannot introduce network or workspace sources", () => {
  expect(() =>
    assertConventionalDependencies({
      dependencies: { typescript: "5.9.3", alias: "npm:yaml@^2.0.0" },
    }),
  ).not.toThrow();
  for (const source of [
    "workspace:*",
    "file:../engine",
    "https://example.invalid/a.tgz",
    "github:owner/repo",
    "git+ssh://example.invalid/repo",
  ]) {
    expect(() => assertConventionalDependencies({ dependencies: { unsafe: source } })).toThrow();
  }
});

test("missing required lock resolution fails while omitted optional platforms stay explicit", () => {
  expect(() =>
    assertLocalResolutions({ packages: { "node_modules/missing": {} } }, "http://127.0.0.1:1", []),
  ).toThrow(/Missing required/);
  expect(() =>
    assertLocalResolutions(
      { packages: { "": {}, "node_modules/optional": { optional: true } } },
      "http://127.0.0.1:1",
      [],
    ),
  ).not.toThrow();
});

test("registry process launch enforces OS confinement before starting Python", () => {
  const process = new ChildProcess();
  const spawnProcess = vi.fn<RegistrySpawner>().mockReturnValue(process);
  const env = { PATH: "/usr/bin:/bin" };
  const registry = [
    "python3",
    "/owned/scripts/local-cache-registry.py",
    "--cache",
    "/cache",
    "--evidence",
    "/owned/evidence.json",
  ];
  expect(launchRegistry(registry, env, spawnProcess)).toBe(process);
  expect(spawnProcess).toHaveBeenCalledTimes(1);
  const [executable, args, options] = spawnProcess.mock.calls[0]!;
  expect(executable).toBe("/usr/bin/sandbox-exec");
  expect(args?.[0]).toBe("-p");
  expect(args?.[1]).toContain("(deny network*)");
  expect(args?.[1]).toContain('(allow network-bind (local ip "localhost:*"))');
  expect(args?.[1]).toContain('(allow network-outbound (remote ip "localhost:*"))');
  expect(args?.slice(2)).toEqual(registry);
  expect(options).toEqual({ env, stdio: ["ignore", "pipe", "pipe"] });
});
