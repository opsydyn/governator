import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@governanator/query/io": `${import.meta.dirname}/packages/query/src/io.ts`,
      "@governanator/query/archive": `${import.meta.dirname}/packages/query/src/archive.ts`,
      "@governanator/query/release-inputs": `${import.meta.dirname}/packages/query/src/release-inputs.ts`,
      "@governanator/query": `${import.meta.dirname}/packages/query/src/index.ts`,
      "@governanator/core": `${import.meta.dirname}/packages/core/src/index.ts`,
      "@governanator/versioning": `${import.meta.dirname}/packages/versioning/src/index.ts`,
    },
  },
  test: { include: ["tests/**/*.test.ts"], fileParallelism: false },
});
