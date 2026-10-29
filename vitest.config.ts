import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@governator/fixture-policy": `${import.meta.dirname}/packages/fixture-policy/src/index.ts`,
      "@governator/fixture-attestation": `${import.meta.dirname}/packages/fixture-attestation/src/index.ts`,
      "@governator/github-review": `${import.meta.dirname}/packages/github-review/src/index.ts`,
      "@governator/query/io": `${import.meta.dirname}/packages/query/src/io.ts`,
      "@governator/query/archive": `${import.meta.dirname}/packages/query/src/archive.ts`,
      "@governator/query/release-inputs": `${import.meta.dirname}/packages/query/src/release-inputs.ts`,
      "@governator/query": `${import.meta.dirname}/packages/query/src/index.ts`,
      "@governator/core": `${import.meta.dirname}/packages/core/src/index.ts`,
      "@governator/versioning": `${import.meta.dirname}/packages/versioning/src/index.ts`,
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "apps/storybook-demo/.storybook/**/*.test.ts"],
    fileParallelism: false,
  },
});
