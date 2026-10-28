import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { tagEditor } from "../packages/storybook-addon/src/tag-editor-server.ts";
import { afterEach, expect, test } from "vitest";
import {
  readRegistryEditor,
  resolveMappedStory,
  saveRegistryEditor,
} from "../packages/storybook-addon/src/registry-editor.ts";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "governator-registry-"));
  roots.push(root);
  await mkdir(join(root, "governance"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src/Button.tsx"), "export const Button = 1;\n");
  await writeFile(join(root, "src/Button.stories.tsx"), "export default {};\n");
  await writeFile(
    join(root, "governance/components.yaml"),
    `# Keep this comment\nschemaVersion: 1\ncomponents:\n  - id: ui.button\n    name: Button\n    package: ui\n    owners: [team]\n    lifecycle: candidate\n    source: src/Button.tsx\n    stories: [src/Button.stories.tsx]\n    contractVersion: 1.0.0-rc.1\n    exportPath: ui\n`,
  );
  return {
    root,
    registryPath: "governance/components.yaml",
    resolveStory: async () => ({ componentId: "ui.button", storyPath: "src/Button.stories.tsx" }),
  };
}

test("saves a validated declaration without losing unrelated comments", async () => {
  const options = await fixture();
  const record = await readRegistryEditor(options, "button--one", "ui.button");
  await saveRegistryEditor(options, "button--one", "ui.button", record.revision, {
    ...record.component,
    name: "Action Button",
  });
  const text = await readFile(join(options.root, options.registryPath), "utf8");
  expect(text).toContain("# Keep this comment");
  expect((await readRegistryEditor(options, "button--one", "ui.button")).component.name).toBe(
    "Action Button",
  );
});

test("rejects mismatched story identity before touching the registry", async () => {
  const options = await fixture();
  await expect(readRegistryEditor(options, "button--one", "ui.other")).rejects.toThrow();
});

test("rejects a stale revision and an invalid deprecated declaration", async () => {
  const options = await fixture();
  const record = await readRegistryEditor(options, "button--one", "ui.button");
  await expect(
    saveRegistryEditor(options, "button--one", "ui.button", "old", record.component),
  ).rejects.toThrow();
  await expect(
    saveRegistryEditor(options, "button--one", "ui.button", record.revision, {
      ...record.component,
      lifecycle: "deprecated",
    }),
  ).rejects.toThrow();
});

test("adds and removes optional registry metadata", async () => {
  const options = await fixture();
  const first = await readRegistryEditor(options, "button--one", "ui.button");
  const added = await saveRegistryEditor(options, "button--one", "ui.button", first.revision, {
    ...first.component,
    documentationUrl: "https://example.test/button",
  });
  expect(
    (await readRegistryEditor(options, "button--one", "ui.button")).component.documentationUrl,
  ).toBe("https://example.test/button");
  const { documentationUrl: _removed, ...withoutUrl } = added.component;
  await saveRegistryEditor(options, "button--one", "ui.button", added.revision, withoutUrl);
  expect(
    (await readRegistryEditor(options, "button--one", "ui.button")).component.documentationUrl,
  ).toBeUndefined();
});

test("adds and removes optional metadata in a flow-style component", async () => {
  const options = await fixture();
  await writeFile(
    join(options.root, options.registryPath),
    `{"schemaVersion":1,"components":[{"id":"ui.button","name":"Button","package":"ui","owners":["team"],"lifecycle":"candidate","source":"src/Button.tsx","stories":["src/Button.stories.tsx"],"contractVersion":"1.0.0-rc.1","exportPath":"ui"}]}\n`,
  );
  const first = await readRegistryEditor(options, "button--one", "ui.button");
  const added = await saveRegistryEditor(options, "button--one", "ui.button", first.revision, {
    ...first.component,
    documentationUrl: "https://example.test/button",
  });
  const { documentationUrl: _removed, ...withoutUrl } = added.component;
  await saveRegistryEditor(options, "button--one", "ui.button", added.revision, withoutUrl);
  expect(
    (await readRegistryEditor(options, "button--one", "ui.button")).component.documentationUrl,
  ).toBeUndefined();
});

test("rejects registry fields that the authoritative schema does not accept without rewriting", async () => {
  const options = await fixture();
  const path = join(options.root, options.registryPath);
  const source = (await readFile(path, "utf8")).replace(
    "    name: Button",
    "    customNote: keep-me\n    name: Button",
  );
  await writeFile(path, source);
  await expect(readRegistryEditor(options, "button--one", "ui.button")).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe(source);
});

test("removes a final flow-style optional field without a trailing comma", async () => {
  const options = await fixture();
  await writeFile(
    join(options.root, options.registryPath),
    `{"schemaVersion":1,"components":[{"id":"ui.button","name":"Button","package":"ui","owners":["team"],"lifecycle":"candidate","source":"src/Button.tsx","stories":["src/Button.stories.tsx"],"contractVersion":"1.0.0-rc.1","exportPath":"ui","documentationUrl":"https://example.test"}]}\n`,
  );
  const first = await readRegistryEditor(options, "button--one", "ui.button");
  const { documentationUrl: _removed, ...withoutUrl } = first.component;
  await saveRegistryEditor(options, "button--one", "ui.button", first.revision, withoutUrl);
  expect(
    (await readRegistryEditor(options, "button--one", "ui.button")).component.documentationUrl,
  ).toBeUndefined();
});

test("refuses to save if the story mapping changes during the write", async () => {
  const options = await fixture();
  const first = await readRegistryEditor(options, "button--one", "ui.button");
  let calls = 0;
  const changing = {
    ...options,
    resolveStory: async () =>
      ++calls === 1 ? { componentId: "ui.button", storyPath: "src/Button.stories.tsx" } : undefined,
  };
  const before = await readFile(join(options.root, options.registryPath), "utf8");
  await expect(
    saveRegistryEditor(changing, "button--one", "ui.button", first.revision, {
      ...first.component,
      name: "Action",
    }),
  ).rejects.toThrow();
  expect(await readFile(join(options.root, options.registryPath), "utf8")).toBe(before);
});

test("rejects aliased YAML and duplicate keys without rewriting", async () => {
  const options = await fixture();
  const path = join(options.root, options.registryPath);
  const source = (await readFile(path, "utf8"))
    .replace("owners: [team]", "owners: &team [team]")
    .replace("    name: Button", "    name: Button\n    name: *team");
  await writeFile(path, source);
  await expect(readRegistryEditor(options, "button--one", "ui.button")).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe(source);
});

test("server-derived story mapping rejects duplicate and escaping identities", async () => {
  const options = await fixture();
  const entry = {
    id: "button--one",
    componentId: "ui.button",
    importPath: "./src/Button.stories.tsx",
    exportName: "One",
  };
  expect(
    await resolveMappedStory(
      options.root,
      options.root,
      { version: 1, stories: [entry] },
      "button--one",
    ),
  ).toEqual({ componentId: "ui.button", storyPath: "src/Button.stories.tsx" });
  expect(
    await resolveMappedStory(
      options.root,
      options.root,
      { version: 1, stories: [entry, entry] },
      "button--one",
    ),
  ).toBeUndefined();
  expect(
    await resolveMappedStory(
      options.root,
      options.root,
      { version: 1, stories: [{ ...entry, importPath: "../other.stories.tsx" }] },
      "button--one",
    ),
  ).toBeUndefined();
});

test("the opt-in server resolves a story on the server before returning a registry record", async () => {
  const options = await fixture();
  let middleware: ((req: any, res: any, next: () => void) => void) | undefined;
  const server = {
    config: { root: options.root },
    middlewares: {
      use: (path: string, handler: typeof middleware) => {
        if (path === "/__governator/registry-editor") middleware = handler;
      },
    },
    [Symbol.for("governator.story-map")]: async () => ({
      version: 1,
      stories: [
        {
          id: "button--one",
          componentId: "ui.button",
          importPath: "./src/Button.stories.tsx",
          exportName: "One",
        },
      ],
    }),
  };
  tagEditor({ registry: { root: options.root, path: options.registryPath } }).configureServer(
    server,
  );
  expect(middleware).toBeDefined();
  const req = Object.assign(Readable.from([]), {
    method: "GET",
    url: "/?storyId=button--one&componentId=ui.button",
    headers: { host: "127.0.0.1:6006" },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const result = await new Promise<{ status: number; body: string }>((resolve) => {
    let status = 0;
    middleware!(
      req,
      {
        writeHead: (value: number) => {
          status = value;
        },
        end: (body: string) => resolve({ status, body }),
      },
      () => {},
    );
  });
  expect(result.status).toBe(200);
  expect(JSON.parse(result.body).component.id).toBe("ui.button");
});

test("concurrent saves from the same revision cannot silently overwrite one another", async () => {
  const options = await fixture();
  const first = await readRegistryEditor(options, "button--one", "ui.button");
  const results = await Promise.allSettled([
    saveRegistryEditor(options, "button--one", "ui.button", first.revision, {
      ...first.component,
      name: "First",
    }),
    saveRegistryEditor(options, "button--one", "ui.button", first.revision, {
      ...first.component,
      name: "Second",
    }),
  ]);
  expect(results.filter((value) => value.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((value) => value.status === "rejected")).toHaveLength(1);
  expect((await readRegistryEditor(options, "button--one", "ui.button")).component.name).toBe(
    "First",
  );
});

test("rejects symlinked source files and registry paths", async () => {
  const options = await fixture();
  const path = join(options.root, options.registryPath);
  await symlink(path, join(options.root, "governance/alias.yaml"));
  await expect(
    readRegistryEditor(
      { ...options, registryPath: "governance/alias.yaml" },
      "button--one",
      "ui.button",
    ),
  ).rejects.toThrow();
  await symlink(join(options.root, "src/Button.tsx"), join(options.root, "src/Alias.tsx"));
  await writeFile(path, (await readFile(path, "utf8")).replace("src/Button.tsx", "src/Alias.tsx"));
  await expect(readRegistryEditor(options, "button--one", "ui.button")).rejects.toThrow();
});
