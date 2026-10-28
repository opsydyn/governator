import { assertSupportedReportSchema } from "./report-schema-subset.ts";
const schema = await Bun.file("packages/protocol/governance-report-versioned.schema.json").json();
assertSupportedReportSchema(schema);
const outputs = new Map([
  [
    "packages/storybook-addon/src/generated-validator.mjs",
    `import { validateSchema } from "./schema-validator.ts";\nconst schema = ${JSON.stringify(schema)};\nexport default (value) => validateSchema(schema, value);\n`,
  ],
  [
    "packages/storybook-addon/src/generated-validator.d.mts",
    `import type { GovernanceReport } from "@governator/protocol";\ndeclare function validate(data: unknown): data is GovernanceReport;\nexport default validate;\n`,
  ],
]);
for (const [path, expected] of outputs) {
  const file = Bun.file(path);
  if (Bun.argv.includes("--check")) {
    if (!(await file.exists()) || (await file.text()) !== expected)
      throw new Error(`Stale addon validator: ${path}; run bun run addon:validator`);
  } else await Bun.write(file, expected);
}
console.log("Standalone browser report validator is current");
