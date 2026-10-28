import { defineConfig } from "tsdown";
import { assertSafeBuildPrepare } from "../../scripts/safe-build-output.ts";
export default defineConfig({
  entry: { server: "src/server.ts", main: "src/main.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  hooks: { "build:prepare": assertSafeBuildPrepare },
  deps: {
    neverBundle: ["typescript", "yaml", "tar", "semver", "@changesets/parse"],
    alwaysBundle: [/^@governator\//, /^effect(?:\/|$)/],
  },
  target: "es2022",
  outDir: "dist",
});
