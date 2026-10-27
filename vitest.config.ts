import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@governanator/fixture-policy": `${import.meta.dirname}/packages/fixture-policy/src/index.ts`,
      "@governanator/fixture-attestation": `${import.meta.dirname}/packages/fixture-attestation/src/index.ts`,
      "@governanator/github-review": `${import.meta.dirname}/packages/github-review/src/index.ts`,
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
