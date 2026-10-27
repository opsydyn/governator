import { defineConfig } from "tsdown";
import { assertSafeBuildPrepare } from "../../scripts/safe-build-output.ts";
export default defineConfig({
  entry: { index: "src/index.ts", main: "src/main.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  hooks: { "build:prepare": assertSafeBuildPrepare },
  deps: {
    neverBundle: ["typescript", "yaml", "tar", "semver", "@changesets/parse"],
    alwaysBundle: [/^@governanator\//, /^effect(?:\/|$)/],
  },
  sourcemap: false,
  target: "es2022",
  outDir: "dist",
});
