import { defineConfig } from "tsdown";
export default defineConfig({
  tsconfig: "tsconfig.json",
  entry: { index: "src/index.ts", preset: "src/preset.ts", manager: "src/manager.tsx" },
  format: ["esm"],
  dts: true,
  clean: true,
  platform: "browser",
  target: "es2022",
  outDir: "dist",
  deps: {
    neverBundle: [/^storybook(?:\/|$)/, /^react(?:\/|$)/],
    alwaysBundle: [/^ajv(?:\/|$)/],
    onlyBundle: [/^ajv(?:\/|$)/],
  },
});
