import { defineConfig } from "oxlint";
import { recommended } from "@opsydyn/oxlint-effect";

export default defineConfig({
  jsPlugins: [...recommended.jsPlugins],
  rules: { ...recommended.rules },
  ignorePatterns: [
    "**/dist/**",
    "packages/protocol/src/generated.ts",
    "packages/protocol/src/query-generated.ts",
    "packages/storybook-addon/src/generated-validator.mjs",
  ],
  overrides: [
    {
      // Private cryptographic wire boundary contains synchronous crypto, validation, and sanitized exceptions.
      files: [
        "packages/fixture-policy/src/*.ts",
        "packages/fixture-attestation/src/index.ts",
        "packages/fixture-attestation/src/crypto.ts",
      ],
      rules: {
        "linteffect/no-string-sentinel-const": "off",
        "linteffect/no-return-in-arrow": "off",
        "linteffect/no-if-statement": "off",
        "linteffect/no-adhoc-domain-error": "off",
        "linteffect/no-domain-logic-in-conditional": "off",
        "linteffect/no-naked-object-state-update": "off",
        "linteffect/no-magic-domain-string": "off",
        "linteffect/no-model-overlay-cast": "off",
        "linteffect/no-new-date-in-domain-logic": "off",
        "linteffect/no-try-catch": "off",
        "linteffect/no-node-platform-in-shared-code": "off",
      },
    },
    {
      // Disposable fixture keys are generated in memory for offline tests only.
      files: [
        "tests/fixture-attestation-fixtures.ts",
        "tests/fixture-attestation.test.ts",
        "tests/fixture-policy*.ts",
      ],
      rules: {
        "linteffect/no-node-platform-in-shared-code": "off",
        "linteffect/no-return-in-arrow": "off",
      },
    },
    {
      // Private injected-transport adapter contains and sanitizes Promise/stream failures.
      files: ["packages/github-review/src/index.ts"],
      rules: { "linteffect/no-try-catch": "off", "linteffect/no-string-sentinel-const": "off" },
    },
    {
      // Lexical JSON wire validation must run before number precision is lost in decoding.
      files: ["packages/github-review/src/json.ts", "packages/fixture-attestation/src/json.ts"],
      rules: { "linteffect/no-naked-object-state-update": "off" },
    },
    {
      // Date receives an explicit provider timestamp for round-trip validation, never wall time.
      files: ["packages/github-review/src/domain.ts"],
      rules: { "linteffect/no-new-date-in-domain-logic": "off" },
    },
    {
      // MCP wire error boundary serializes typed failures; SDK integration tests own cleanup.
      files: ["packages/mcp/src/boundary.ts", "tests/mcp-*.test.ts", "scripts/mcp-smoke.ts"],
      rules: { "linteffect/no-try-catch": "off", "linteffect/no-naked-object-state-update": "off" },
    },
    {
      // Fixed read-only Git adapter disables index refresh writes; ambient env is confined here.
      files: ["packages/query/src/io.ts"],
      rules: { "linteffect/no-process-env-direct-read": "off" },
    },
    {
      // The public addon is a native Storybook/React adapter and must not ship Effect.
      // React effects own fetch cancellation/cleanup; UI state stays local to this read-only panel.
      files: [
        "packages/storybook-addon/src/manager.tsx",
        "packages/storybook-addon/src/discovery.tsx",
      ],
      rules: {
        "linteffect/no-react-state": "off",
        "linteffect/no-return-in-arrow": "off",
        "linteffect/no-return-in-callback": "off",
      },
    },
    {
      // Browser fetch/JSON error boundary; importing Effect here would violate distribution isolation.
      files: [
        "packages/storybook-addon/src/report.ts",
        "packages/storybook-addon/src/story-navigation.ts",
      ],
      rules: { "linteffect/no-try-catch": "off" },
    },
    {
      // Native React UI and browser serialization stay independent of the private Effect engine.
      files: ["packages/storybook-addon/src/tag-editor-ui.tsx"],
      rules: {
        "linteffect/no-react-state": "off",
        "linteffect/no-try-catch": "off",
        "linteffect/no-return-in-arrow": "off",
        "linteffect/no-naked-object-state-update": "off",
      },
    },
    {
      // Optional Node-only authoring boundary handles CSF parsing, HTTP and filesystem cleanup.
      files: [
        "packages/storybook-addon/src/tag-{csf,storage,editor-server}.ts",
        "packages/storybook-addon/src/story-index.ts",
      ],
      rules: {
        "linteffect/no-node-platform-in-shared-code": "off",
        "linteffect/no-try-catch": "off",
        "linteffect/no-return-in-arrow": "off",
        "linteffect/no-string-sentinel-const": "off",
        "linteffect/no-naked-object-state-update": "off",
      },
    },
    {
      // The rendered UI test uses a small deterministic fetch stub.
      files: ["tests/storybook-tag-editor-ui.test.ts", "tests/addon-validator-equivalence.test.ts"],
      rules: { "linteffect/no-return-in-arrow": "off" },
    },
    {
      // Temporary CSF fixture cleanup and schema generation are boundary operations.
      files: ["tests/storybook-source-navigation.test.ts"],
      rules: { "linteffect/no-try-catch": "off" },
    },
    {
      // These files implement wire serialization or deliberately construct malformed test inputs.
      files: [
        "scripts/protocol.ts",
        "scripts/schema-deduplicate.ts",
        "scripts/dogfood-report.ts",
        "scripts/snapshot-demo-baseline.ts",
        "scripts/snapshot-release-baseline.ts",
        "scripts/release-demo.ts",
        "scripts/mcp-{smoke,readonly-preload}.ts",
        "packages/core/src/digest.ts",
        "packages/cli/src/**/*.ts",
        "packages/query/src/{io,archive,release-inputs,snapshot,service}.ts",
        "tests/**/*.ts",
      ],
      rules: { "linteffect/no-naked-object-state-update": "off" },
    },
    {
      // Private Bun adapter and deterministic hashing; neither is shipped in the public protocol.
      files: [
        "packages/cli/src/files.ts",
        "packages/core/src/digest.ts",
        "packages/query/src/{io,release-inputs,snapshot}.ts",
        "tests/query-fixtures.ts",
        "tests/release-fixtures.ts",
      ],
      rules: { "linteffect/no-node-platform-in-shared-code": "off" },
    },
    {
      // Literal fixture values are test data, not runtime status sentinels.
      files: [
        "tests/**/*.ts",
        "scripts/snapshot-demo-baseline.ts",
        "scripts/snapshot-release-baseline.ts",
        "scripts/mcp-smoke.ts",
      ],
      rules: { "linteffect/no-string-sentinel-const": "off" },
    },
  ],
});
