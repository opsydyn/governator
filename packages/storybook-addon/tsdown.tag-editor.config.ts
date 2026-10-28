import { defineConfig } from "tsdown";
export default defineConfig({
  tsconfig: "tsconfig.json",
  entry: { "tag-editor": "src/tag-editor-server.ts", preset: "src/preset.ts" },
  format: ["esm"],
  dts: true,
  clean: false,
  platform: "node",
  target: "es2022",
  outDir: "dist",
  deps: { neverBundle: [/^storybook(?:\/|$)/], onlyBundle: false },
});
