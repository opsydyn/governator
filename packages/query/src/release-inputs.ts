import { relative, resolve, join } from "node:path";
import { ensure, decode, digest } from "@governanator/core";
import { ReleaseConfig, ReleaseArtifact, ChangeRecord } from "@governanator/versioning";
import { ApiConfigSchema } from "@governanator/versioning";
import { loadProject, containedFile } from "./io.ts";
import { cleanHead, git } from "./io.ts";
import { bytesDigest, inspectArchive } from "./archive.ts";
export async function releaseInputs(
  root: string,
  path: string,
  options: { safeDeclarations?: boolean } = {},
) {
  ensure(
    git(root, ["ls-files", "--", "node_modules"]).length === 0,
    "Installed node_modules must not be tracked in the source snapshot",
  );
  const commit = cleanHead(root),
    hashes: Record<string, string> = Object.create(null);
  async function tracked(file: string): Promise<string> {
    const target = await containedFile(root, file),
      key = relative(root, target);
    git(root, ["ls-files", "--error-unmatch", "--", key]);
    const bytes = await Bun.file(target).bytes();
    ensure(bytes.length <= 4 * 1024 * 1024, `Release input too large: ${key}`);
    hashes[key] = bytesDigest(bytes);
    return new TextDecoder().decode(bytes);
  }
  const configPath = relative(root, await containedFile(root, path));
  const config = decode(ReleaseConfig, JSON.parse(await tracked(configPath)));
  const manifest = JSON.parse(await tracked(join(config.packageDirectory, "package.json")));
  const apiConfig = decode(ApiConfigSchema, JSON.parse(await tracked(config.apiConfig)));
  ensure(
    apiConfig.packageId === manifest.name && apiConfig.packageVersion === manifest.version,
    "API config and package manifest identity/version mismatch",
  );
  const project = await loadProject(root);
  const registered = project.registry.components.filter((c) => c.package === manifest.name);
  ensure(
    registered.length === apiConfig.components.length,
    "API config must cover the registered package components exactly",
  );
  for (const item of registered)
    ensure(
      apiConfig.components.some(
        (c) => c.componentId === item.id && c.contractVersion === item.contractVersion,
      ) && item.packageVersion === manifest.version,
      "Registry, API config and package versions must agree",
    );
  for (const file of [
    "governance/components.yaml",
    "governance/policy.yaml",
    config.mapping,
    "package.json",
  ])
    await tracked(file);
  for (const file of [
    "governance/evidence.json",
    "governance/waivers.json",
    "bun.lock",
    "tsconfig.json",
    join(config.packageDirectory, "tsdown.config.ts"),
  ])
    if (await Bun.file(resolve(root, file)).exists()) await tracked(file);
  const baseline = decode(ReleaseArtifact, JSON.parse(await tracked(config.baseline)));
  ensure(
    digest(baseline) === (await tracked(config.baselineDigest)).trim(),
    "Release baseline digest mismatch",
  );
  ensure(
    baseline.manifest.name === manifest.name,
    "Release baseline belongs to a different package",
  );
  await tracked(config.baselineArchive);
  const actualBaseline = await inspectArchive(
    await Bun.file(await containedFile(root, config.baselineArchive)).bytes(),
    {
      packageId: baseline.api.packageId,
      packageVersion: baseline.api.packageVersion,
      components: baseline.api.components.map((c) => ({
        componentId: c.componentId,
        exportName: c.exportName,
        propsExport: c.propsExport,
        contractVersion: c.contractVersion,
      })),
    },
    config.declaration,
    options.safeDeclarations ?? false,
  );
  ensure(
    digest(actualBaseline) === digest(baseline),
    "Baseline report does not match its immutable archive",
  );
  const found: string[] = [];
  for await (const file of new Bun.Glob(".changeset/*.md").scan({ cwd: root }))
    if (file !== ".changeset/README.md") found.push(file);
  ensure(
    digest([...config.changesets].sort()) === digest(found.sort()),
    "Release config must enumerate every pending .changeset/*.md (except README.md)",
  );
  const consumers: string[] = [];
  for (const path of config.consumerFixtures) consumers.push(await tracked(path));
  const intents = [];
  for (const file of config.changesets) intents.push({ id: file, contents: await tracked(file) });
  const classification = config.classification
    ? decode(ChangeRecord, JSON.parse(await tracked(config.classification)))
    : null;
  const documents: Record<string, string> = Object.create(null);
  if (classification)
    for (const file of Object.values(classification.documents))
      documents[file] = await tracked(file);
  return {
    commit,
    configPath,
    config,
    manifest,
    apiConfig,
    baseline,
    intents,
    classification,
    documents,
    consumers,
    inputDigest: digest(hashes),
  };
}
