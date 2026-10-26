import { Ajv2020 } from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
const ajv = new Ajv2020({ strict: false, code: { source: true, esm: true } });
const schema = await Bun.file("packages/protocol/governance-report.schema.json").json();
const validate = ajv.compile(schema);
const outputs = new Map([
  ["packages/storybook-addon/src/generated-validator.mjs", standaloneCode(ajv, validate)],
  [
    "packages/storybook-addon/src/generated-validator.d.mts",
    `import type { GovernanceReport } from "@governanator/protocol";\ndeclare function validate(data: unknown): data is GovernanceReport;\nexport default validate;\n`,
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
