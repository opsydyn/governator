import { expect, test } from "vitest";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const publicPackages = [
  "@opsydyn/governator-cli",
  "@opsydyn/governator-mcp",
  "@opsydyn/storybook-addon-governator",
];

test("only the three selected packages are eligible for public release", async () => {
  const publishable: string[] = [];
  for (const group of ["packages", "apps"]) {
    for (const directory of await readdir(join(root, group))) {
      const file = Bun.file(join(root, group, directory, "package.json"));
      if (!(await file.exists())) continue;
      const manifest = await file.json();
      if (manifest.private !== true) publishable.push(manifest.name);
    }
  }
  expect(publishable.sort()).toEqual([...publicPackages].sort());
});

test.each(["storybook-addon", "cli", "mcp"])(
  "%s has first-release package metadata",
  async (name) => {
    const manifest = await Bun.file(join(root, "packages", name, "package.json")).json();
    expect(manifest).toMatchObject({
      name:
        name === "storybook-addon"
          ? "@opsydyn/storybook-addon-governator"
          : `@opsydyn/governator-${name}`,
      private: false,
      license: "MIT",
      repository: {
        type: "git",
        url: "git+https://github.com/opsydyn/governator.git",
        directory: `packages/${name}`,
      },
      bugs: { url: "https://github.com/opsydyn/governator/issues" },
      homepage: `https://github.com/opsydyn/governator/tree/main/packages/${name}#readme`,
      publishConfig: { access: "public", provenance: true },
      scripts: { prepack: "bun run build" },
    });
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest.description).toBeTruthy();
    expect(manifest.files).toContain("LICENSE");
    expect(manifest.files).toContain("THIRD_PARTY_NOTICES.md");
    const notices = await Bun.file(join(root, "packages", name, "THIRD_PARTY_NOTICES.md")).text();
    expect(notices).toContain("Copyright (c) 2023 Effectful Technologies Inc");
    if (name === "storybook-addon") expect(notices).toContain("Copyright Eemeli Aro");
    expect(await Bun.file(join(root, "packages", name, "LICENSE")).text()).toContain("MIT License");
    for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }))
      expect(dep === "effect" || dep.startsWith("@governator/")).toBe(false);
  },
);
