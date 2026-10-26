import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@governanator/core": `${import.meta.dirname}/packages/core/src/index.ts`,
      "@governanator/versioning": `${import.meta.dirname}/packages/versioning/src/index.ts`,
    },
  },
  test: { include: ["tests/**/*.test.ts"], fileParallelism: false },
});
