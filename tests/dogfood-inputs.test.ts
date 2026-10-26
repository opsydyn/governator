import { expect, test } from "vitest";
import { validateDogfoodInputs } from "../scripts/dogfood-inputs.ts";
import { loadProject } from "../packages/cli/src/files.ts";
test("dogfood rejects package, registry and API mapping drift", async () => {
  const config = await Bun.file("governance/api-config.json").json();
  const manifest = await Bun.file("packages/demo-ui/package.json").json();
  const { registry } = await loadProject(process.cwd());
  expect(() => validateDogfoodInputs(config, manifest, registry)).not.toThrow();
  expect(() =>
    validateDogfoodInputs(config, { ...manifest, version: "99.0.0" }, registry),
  ).toThrow();
  expect(() =>
    validateDogfoodInputs(
      { ...config, components: config.components.slice(1) },
      manifest,
      registry,
    ),
  ).toThrow();
  expect(() =>
    validateDogfoodInputs(
      {
        ...config,
        components: config.components.map((c: object) => ({ ...c, contractVersion: "99.0.0" })),
      },
      manifest,
      registry,
    ),
  ).toThrow();
});
