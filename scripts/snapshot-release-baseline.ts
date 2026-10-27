import { inspectArchive } from "../packages/cli/src/archive.ts";
import { digest, ensure } from "../packages/core/src/index.ts";
const output = "governance/releases/ui-8.4.1.json";
ensure(
  !(await Bun.file(output).exists()),
  "Immutable release fixture already exists; never overwrite it",
);
const api = await Bun.file("governance/api-baselines/ui-8.4.1.json").json();
const artifact = await inspectArchive(
  await Bun.file("fixtures/releases/ui-8.4.1/package.tar.gz").bytes(),
  {
    packageId: api.packageId,
    packageVersion: api.packageVersion,
    components: api.components.map(
      (c: {
        componentId: string;
        exportName: string;
        propsExport: string;
        contractVersion: string;
      }) => ({
        componentId: c.componentId,
        exportName: c.exportName,
        propsExport: c.propsExport,
        contractVersion: c.contractVersion,
      }),
    ),
  },
  "dist/index.d.mts",
);
await Bun.write(output, JSON.stringify(artifact, null, 2) + "\n");
await Bun.write(output + ".sha256", digest(artifact) + "\n");
console.log("Created exact local tarball release baseline; publication remains unknown");
