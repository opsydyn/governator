import { defineConfig } from "tsdown";
import { packageCliSkill } from "../../scripts/package-cli-skill.ts";
import { assertSafeBuildPrepare } from "../../scripts/safe-build-output.ts";
export default defineConfig({
  entry: { index: "src/index.ts", main: "src/main.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  hooks: { "build:prepare": assertSafeBuildPrepare, "build:done": packageCliSkill },
  deps: {
    neverBundle: ["typescript", "yaml", "tar", "semver", "@changesets/parse"],
    alwaysBundle: [
      /^@governator\//,
      /^effect(?:\/|$)/,
      /^@effect\/platform-(?:bun|node-shared)(?:\/|$)/,
    ],
  },
  sourcemap: false,
  target: "es2022",
  outDir: "dist",
});
