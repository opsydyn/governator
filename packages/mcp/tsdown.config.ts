import { defineConfig } from "tsdown";
export default defineConfig({
  entry: { server: "src/server.ts", main: "src/main.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  target: "es2022",
  outDir: "dist",
});
