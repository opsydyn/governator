import { defineConfig } from "tsdown";
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  target: "es2022",
  outDir: "dist",
  deps: { neverBundle: [/^react(?:\/|$)/] },
});
