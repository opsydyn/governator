import { expect, test } from "vitest";
import { inspectAddon } from "../scripts/addon-boundaries.ts";
test("addon allows only Storybook peers and manager-provided React", () => {
  const manifest = { peerDependencies: { storybook: "^10.6.4" } };
  expect(
    inspectAddon(manifest, [
      'import { addons } from "storybook/manager-api"; import {useState} from "react";',
    ]),
  ).toEqual([]);
  expect(inspectAddon({ ...manifest, dependencies: { effect: "4.0.6" } }, [])).not.toEqual([]);
  expect(
    inspectAddon({ peerDependencies: { ...manifest.peerDependencies, react: "*" } }, []),
  ).not.toEqual([]);
  for (const source of [
    'import "effect";',
    'import {jsx} from "react/jsx-runtime";',
    'export {foo} from "node:fs";',
    'import("@governanator/core")',
    'require("node:path")',
  ])
    expect(inspectAddon(manifest, [source])).not.toEqual([]);
});
