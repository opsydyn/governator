import { afterEach, expect, test } from "vitest";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  inspectFixtureAttestation as inspect,
  inspectFixtureManifest,
  inspectFixtureSources,
} from "../scripts/fixture-attestation-boundaries.ts";

test("fixture verifier permits its local modules, Effect, and node crypto", async () => {
  expect(
    await inspect(
      'import { verify } from "node:crypto"; import { Schema } from "effect"; import { parse } from "./json.ts"; verify(key, data); Reflect.ownKeys(data);',
    ),
  ).toEqual([]);
});

test("fixture verifier rejects imports that can escape its package or access IO", async () => {
  for (const source of [
    'import fs from "node:fs";',
    'export * from "node:https";',
    'import x from "../other/src/index.ts";',
    'import x from "arbitrary-package";',
    'import("./json.ts");',
    'type T = import("node:fs").Stats;',
    'require("node:fs");',
    'import.meta["require"]("node:fs");',
  ])
    expect(await inspect(source), source).not.toEqual([]);
});

test("fixture verifier rejects ambient IO, network, credentials and dynamic execution", async () => {
  for (const source of [
    'fetch("https://example.invalid");',
    "process.env.GITHUB_TOKEN;",
    'Bun.file("secret");',
    'Deno.readTextFile("secret");',
    "new WebSocket(url);",
    "new XMLHttpRequest();",
    'globalThis["fetch"](url);',
    'window["fetch"](url);',
    'eval("code");',
    'new Function("return 1");',
    'console.log("data");',
    '({}).constructor.constructor("return process")().env;',
    '({})["constructor"]["constructor"]("return process")().env;',
    '({})["con" + "structor"]("return process")().env;',
    'Reflect.get(Object, "constructor")("return pro" + "cess")().env;',
    'Reflect["get"](Object, "constructor")("return 1")();',
    "const getter = Reflect.get;",
    "const ownKeys = Reflect.ownKeys;",
    'Object.getOwnPropertyDescriptor(Object, "constructor").value("return 1")();',
  ])
    expect(await inspect(source), source).not.toEqual([]);
});

test("fixture verifier manifest stays private and cannot gain IO dependencies", () => {
  const inspect = inspectFixtureManifest;
  expect(inspect({ private: true, dependencies: { effect: "4.0.6" } })).toEqual([]);
  expect(inspect({ private: false })).not.toEqual([]);
  expect(inspect({ private: true, dependencies: { "node-fetch": "1" } })).not.toEqual([]);
  expect(inspect({ private: true, peerDependencies: { effect: "4" } })).not.toEqual([]);
});

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("fixture source discovery rejects alternate source extensions and symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixture-boundary-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "safe.ts"), 'import { verify } from "node:crypto";');
  const inspectSources = () => inspectFixtureSources(root);
  expect(await inspectSources()).toEqual([]);
  for (const ext of ["tsx", "jsx", "mts", "cts", "js", "mjs", "cjs", "json"]) {
    const hidden = join(root, `hidden.${ext}`);
    await writeFile(hidden, 'import fs from "node:fs";');
    expect(await inspectSources(), ext).not.toEqual([]);
    await rm(hidden);
  }
  await symlink(join(root, "safe.ts"), join(root, "alias.ts"));
  expect(await inspectSources()).not.toEqual([]);
});
