import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";
import { assertSafeBuildOutput } from "../../scripts/safe-build-output.ts";
assertSafeBuildOutput(fileURLToPath(new URL("./dist", import.meta.url)));
export default defineConfig({
  entry: { index: "src/index.ts", main: "src/main.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  deps: {
    neverBundle: ["typescript", "yaml", "tar", "semver", "@changesets/parse"],
    alwaysBundle: [/^@governanator\//, /^effect(?:\/|$)/],
  },
  sourcemap: false,
  target: "es2022",
  outDir: "dist",
});
