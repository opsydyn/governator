import { digest } from "../packages/core/src/digest.ts";
import { expect, test } from "vitest";
import { mkdtemp, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create } from "tar";
import { inspectArchive } from "../packages/cli/src/archive.ts";
const config = {
  packageId: "@test/ui",
  packageVersion: "1.0.1",
  components: [
    {
      componentId: "ui.button",
      exportName: "Button",
      propsExport: "ButtonProps",
      contractVersion: "1.0.0",
    },
  ],
};
async function archive(link = false, missingExport = false, decoy = false, special?: string) {
  const root = await mkdtemp(join(tmpdir(), "governanator-archive-"));
  await mkdir(join(root, "package/dist"), { recursive: true });
  await writeFile(
    join(root, "package/package.json"),
    JSON.stringify({
      name: "@test/ui",
      version: "1.0.1",
      type: "module",
      exports: decoy
        ? {
            "./dist/index.d.ts": "./dist/index.js",
            ".": { types: "./dist/other.d.ts", import: "./dist/index.js" },
          }
        : {
            ".": {
              types: "./dist/index.d.ts",
              import: missingExport ? "./missing.js" : "./dist/index.js",
            },
          },
      peerDependencies: { react: "^19" },
    }),
  );
  await writeFile(
    join(root, "package/dist/index.d.ts"),
    "export interface ButtonProps { label:string } export declare function Button(props:ButtonProps):string;",
  );
  if (decoy)
    await writeFile(
      join(root, "package/dist/other.d.ts"),
      "export interface RealProps { required:boolean }; export declare function Button(props:RealProps):string;",
    );
  if (link) await symlink("/etc/passwd", join(root, "package/dist/index.js"));
  else
    await writeFile(
      join(root, "package/dist/index.js"),
      "export function Button(props){return props.label;}",
    );
  if (special) await writeFile(join(root, "package/__proto__"), special);
  const packed = join(root, "candidate.tgz");
  await create({ gzip: true, cwd: root, file: packed }, ["package"]);
  const bytes = await Bun.file(packed).bytes();
  await rm(root, { recursive: true });
  return bytes;
}
test("inspects actual packed manifest, declarations and bytes without extraction", async () => {
  const result = await inspectArchive(await archive(), config, "dist/index.d.ts");
  expect(result.manifest.name).toBe("@test/ui");
  expect(result.api.components[0]?.props.label?.type).toBe("string");
  expect(result.files["dist/index.js"]).toMatch(/^sha256:/);
});
test("rejects links, unresolved export targets, invalid archives and oversized inputs", async () => {
  await expect(inspectArchive(await archive(true), config, "dist/index.d.ts")).rejects.toThrow(
    /link|regular|entry/i,
  );
  await expect(
    inspectArchive(await archive(false, true), config, "dist/index.d.ts"),
  ).rejects.toThrow(/export|missing/i);
  await expect(
    inspectArchive(new TextEncoder().encode("not tar"), config, "dist/index.d.ts"),
  ).rejects.toThrow();
  await expect(
    inspectArchive(new Uint8Array(5 * 1024 * 1024), config, "dist/index.d.ts"),
  ).rejects.toThrow(/size|large|limit/i);
});

test("rejects a private declaration advertised only as an export key", async () => {
  await expect(
    inspectArchive(await archive(false, false, true), config, "dist/index.d.ts"),
  ).rejects.toThrow(/type|export/i);
});

test("all legal root filenames participate in payload fingerprints", async () => {
  const old = await inspectArchive(
    await archive(false, false, false, "old"),
    config,
    "dist/index.d.ts",
  );
  const next = await inspectArchive(
    await archive(false, false, false, "changed"),
    config,
    "dist/index.d.ts",
  );
  expect(Object.hasOwn(old.files, "__proto__")).toBe(true);
  expect(digest(old.files)).not.toBe(digest(next.files));
});
