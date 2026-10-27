import { defineConfig } from "oxlint";
import { recommended } from "@opsydyn/oxlint-effect";

export default defineConfig({
  jsPlugins: [...recommended.jsPlugins],
  rules: { ...recommended.rules },
  ignorePatterns: [
    "**/dist/**",
    "packages/protocol/src/generated.ts",
    "packages/storybook-addon/src/generated-validator.mjs",
  ],
  overrides: [
    {
      // The public addon is a native Storybook/React adapter and must not ship Effect.
      // React effects own fetch cancellation/cleanup; UI state stays local to this read-only panel.
      files: ["packages/storybook-addon/src/manager.tsx"],
      rules: {
        "linteffect/no-react-state": "off",
        "linteffect/no-return-in-arrow": "off",
        "linteffect/no-return-in-callback": "off",
      },
    },
    {
      // Browser fetch/JSON error boundary; importing Effect here would violate distribution isolation.
      files: ["packages/storybook-addon/src/report.ts"],
      rules: { "linteffect/no-try-catch": "off" },
    },
    {
      // These files implement wire serialization or deliberately construct malformed test inputs.
      files: [
        "scripts/protocol.ts",
        "scripts/dogfood-report.ts",
        "scripts/snapshot-demo-baseline.ts",
        "scripts/snapshot-release-baseline.ts",
        "scripts/release-demo.ts",
        "packages/core/src/digest.ts",
        "packages/cli/src/**/*.ts",
        "tests/**/*.ts",
      ],
      rules: { "linteffect/no-naked-object-state-update": "off" },
    },
    {
      // Private Bun adapter and deterministic hashing; neither is shipped in the public protocol.
      files: ["packages/cli/src/files.ts", "packages/core/src/digest.ts"],
      rules: { "linteffect/no-node-platform-in-shared-code": "off" },
    },
    {
      // Literal fixture values are test data, not runtime status sentinels.
      files: [
        "tests/**/*.ts",
        "scripts/snapshot-demo-baseline.ts",
        "scripts/snapshot-release-baseline.ts",
      ],
      rules: { "linteffect/no-string-sentinel-const": "off" },
    },
  ],
});
