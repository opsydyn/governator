import { defineConfig } from "tsdown";
export default defineConfig({
  entry: {
    index: "src/index.ts",
    io: "src/io.ts",
    archive: "src/archive.ts",
    "release-inputs": "src/release-inputs.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  target: "es2022",
  outDir: "dist",
});
