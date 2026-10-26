import { defineConfig } from "oxlint";
import { recommended } from "@opsydyn/oxlint-effect";

export default defineConfig({
  jsPlugins: [...recommended.jsPlugins],
  rules: { ...recommended.rules },
  ignorePatterns: ["**/dist/**", "packages/protocol/src/generated.ts"],
  overrides: [
    {
      // These files implement wire serialization or deliberately construct malformed test inputs.
      files: [
        "scripts/protocol.ts",
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
      files: ["tests/**/*.ts"],
      rules: { "linteffect/no-string-sentinel-const": "off" },
    },
  ],
});
