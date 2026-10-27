import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  inspectFixturePolicy as inspect,
  inspectPolicyManifest as inspectManifest,
  inspectPolicySources as inspectSources,
} from "../scripts/fixture-policy-boundaries.ts";

test("policy manifest cannot acquire runtime dependencies", () => {
  expect(inspectManifest({ private: true })).toEqual([]);
  expect(inspectManifest({ private: false })).not.toEqual([]);
  expect(inspectManifest({ private: true, dependencies: { effect: "4" } })).not.toEqual([]);
  expect(inspectManifest({ private: true, peerDependencies: { effect: "4" } })).not.toEqual([]);
});

test("policy guard permits local source and crypto, rejects import and ambient escape paths", () => {
  expect(
    inspect(
      'import { verify } from "node:crypto"; import { parse } from "./secure.ts"; Reflect.ownKeys(data);',
    ),
  ).toEqual([]);
  expect(inspect("history[version - 1]; rootTimes[rotations.indexOf(rotation) + 1];")).toEqual([]);
  for (const source of [
    'import { Schema } from "effect";',
    'import fs from "node:fs";',
    'export * from "../other/index.ts";',
    'import("node:fs");',
    'type T = import("node:fs").Stats;',
    'require("node:fs");',
    'import.meta["require"]("node:fs");',
    "fetch(url);",
    "process.env.TOKEN;",
    'Bun.file("secret");',
    'globalThis["fetch"](url);',
    'new Function("code");',
    '({})["con" + "structor"]("return process")();',
    'Reflect.get(Object, "constructor");',
    "const keys = Reflect.ownKeys;",
  ])
    expect(inspect(source), source).not.toEqual([]);
});

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("policy source discovery rejects hidden source types and symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "policy-boundary-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "safe.ts"), 'import { verify } from "node:crypto";');
  expect(await inspectSources(root)).toEqual([]);
  await writeFile(join(root, "hidden.mjs"), 'import fs from "node:fs";');
  expect(await inspectSources(root)).not.toEqual([]);
  await rm(join(root, "hidden.mjs"));
  await symlink(join(root, "safe.ts"), join(root, "alias.ts"));
  expect(await inspectSources(root)).not.toEqual([]);
});
