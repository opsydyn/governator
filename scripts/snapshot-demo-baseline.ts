import { snapshotApi } from "../packages/versioning/src/api.ts";
import { digest } from "../packages/core/src/digest.ts";
const target = "governance/api-baselines/ui-8.4.1.json";
if (await Bun.file(target).exists())
  throw new Error(
    "Immutable fixture baseline already exists. Create a new release fixture rather than overwriting it.",
  );
const config = await Bun.file("governance/api-config.json").json();
config.packageVersion = "8.4.1";
config.components = config.components.map(
  (c: { componentId: string; contractVersion: string }) => ({
    ...c,
    contractVersion: c.componentId === "ui.button" ? "1.2.0" : c.contractVersion,
  }),
);
const snapshot = snapshotApi(
  await Bun.file("fixtures/releases/ui-8.4.1/dist/index.d.mts").text(),
  config,
);
await Bun.write(target, JSON.stringify(snapshot, null, 2) + "\n");
await Bun.write(target + ".sha256", digest(snapshot) + "\n");
console.log(`Created local release fixture ${target}`);
