/* oxlint-disable linteffect/no-return-in-arrow, linteffect/no-try-catch, linteffect/no-naked-object-state-update -- Private publisher boundary fixtures. */
import { test, expect } from "vitest";
import { mkdtemp, writeFile, rm, symlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { verifyRetained, releaseArchives, readVersion, main } from "../scripts/publish-retained.ts";
import type { ReleaseInventory, VerifiedArchive } from "../scripts/publish-retained.ts";

const names = ["governator-cli", "governator-mcp", "storybook-addon-governator"];
function fixture(): { inventory: ReleaseInventory; archives: VerifiedArchive[] } {
  const archives = names.map((name) => {
    const bytes = Buffer.from(`retained-${name}`);
    return {
      name: `@opsydyn/${name}`,
      version: "0.2.0",
      archive: `opsydyn-${name}-0.2.0.tgz`,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
      bytes,
    };
  });
  return {
    inventory: {
      version: "0.2.0",
      sourceCommit: "a".repeat(40),
      packages: archives.map(({ bytes: _bytes, ...entry }) => entry),
    },
    archives,
  };
}

test("verifies every retained archive; refuses changed bytes and links", async () => {
  const dir = await mkdtemp(join(tmpdir(), "governator-publish-test-"));
  const { inventory, archives } = fixture();
  try {
    for (const entry of archives) await writeFile(join(dir, entry.archive), entry.bytes);
    expect(await verifyRetained(dir, inventory)).toHaveLength(3);
    await writeFile(join(dir, archives[2]!.archive), "changed");
    await expect(verifyRetained(dir, inventory)).rejects.toThrow(/digest|size/i);
    await rm(join(dir, archives[2]!.archive));
    await symlink(join(dir, archives[0]!.archive), join(dir, archives[2]!.archive));
    await expect(verifyRetained(dir, inventory)).rejects.toThrow();
    await expect(
      verifyRetained(dir, { ...inventory, packages: inventory.packages.slice(0, 2) }),
    ).rejects.toThrow(/package set/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("preflights all packages before sending and refuses conflicting or unavailable reads", async () => {
  const { archives } = fixture();
  let sends = 0;
  await expect(
    releaseArchives(archives, {
      read: async (entry) => (entry.name === archives[2]!.name ? Buffer.from("conflict") : null),
      send: async () => {
        sends++;
      },
    }),
  ).rejects.toThrow(/conflict/i);
  expect(sends).toBe(0);
  await expect(
    releaseArchives(archives, {
      read: async () => {
        throw new Error("unavailable");
      },
      send: async () => {
        sends++;
      },
    }),
  ).rejects.toThrow(/unavailable/i);
  expect(sends).toBe(0);
});

test("reruns verify uncertain uploads without resending and reject later tampering", async () => {
  const { archives } = fixture();
  const stored = new Map<string, Buffer>();
  let sends = 0;
  const port = {
    read: async (entry: VerifiedArchive) => stored.get(entry.name) ?? null,
    send: async (entry: VerifiedArchive) => {
      sends++;
      stored.set(entry.name, Buffer.from(entry.bytes));
      if (sends === 1) throw new Error("uncertain acknowledgement");
    },
  };
  await expect(releaseArchives(archives, port)).rejects.toThrow(/uncertain/i);
  expect(sends).toBe(1);
  const result = await releaseArchives(archives, port);
  expect(result.map((r) => r.state)).toEqual(["already_verified", "verified", "verified"]);
  expect(sends).toBe(3);
  archives[0]!.bytes.fill(0);
  await expect(releaseArchives(archives, port)).rejects.toThrow(/digest/i);
  expect(sends).toBe(3);
});

test("allows bounded delayed readback and rejects changed received bytes", async () => {
  const { archives } = fixture();
  const sent = new Set<string>();
  let delayed = false;
  const result = await releaseArchives(
    archives,
    {
      read: async (entry) => {
        if (!sent.has(entry.name)) return null;
        if (!delayed) {
          delayed = true;
          return null;
        }
        return entry.bytes;
      },
      send: async (entry) => {
        sent.add(entry.name);
      },
    },
    { attempts: 2, pause: async () => {} },
  );
  expect(result.every((r) => r.state === "verified")).toBe(true);
  sent.clear();
  await expect(
    releaseArchives(archives, {
      read: async (entry) => (sent.has(entry.name) ? Buffer.from("wrong bytes") : null),
      send: async (entry) => {
        sent.add(entry.name);
      },
    }),
  ).rejects.toThrow(/conflict/i);
});

test("registry reads reject HTTP failures, redirects, wrong identities and off-origin tarballs", async () => {
  const entry = fixture().archives[0]!;
  const registry = new URL("https://registry.npmjs.org/");
  expect(
    await readVersion(registry, entry, async () => new Response(null, { status: 404 })),
  ).toBeNull();
  for (const status of [302, 401, 429, 503])
    await expect(
      readVersion(registry, entry, async () => new Response(null, { status })),
    ).rejects.toThrow();
  for (const body of [
    { name: entry.name, version: "0.1.0", dist: { tarball: registry.href } },
    {
      name: entry.name,
      version: entry.version,
      dist: { tarball: "https://example.com/archive.tgz" },
    },
  ])
    await expect(readVersion(registry, entry, async () => Response.json(body))).rejects.toThrow();
  await expect(
    readVersion(registry, entry, async () => new Response(new Uint8Array(1024 * 1024 + 1))),
  ).rejects.toThrow(/limit/i);
});

test("workflow defaults to manual rehearsal, pins inputs and isolates the npm token", async () => {
  const text = await readFile(".github/workflows/release.yml", "utf8");
  const workflow = Bun.YAML.parse(text) as any;
  expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
  expect(workflow.on.workflow_dispatch.inputs.mode.default).toBe("rehearse");
  expect(workflow.jobs.release.if).toContain("refs/heads/main");
  expect(text).toContain("governator-v0.2.0-candidate");
  expect(text).toContain("publish-retained.ts");
  expect(text).not.toMatch(/npm pack|changeset publish|bun install|npm install|12892062222/);
  for (const step of workflow.jobs.release.steps) {
    if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
    if (JSON.stringify(step).includes("secrets.NPM_TOKEN"))
      expect(step.if).toContain("inputs.mode == 'publish'");
  }
});

test("live execution refuses missing confirmation before accessing files or credentials", async () => {
  await expect(main(["publish", "/nonexistent"], {})).rejects.toThrow(/confirmation/i);
  const env = {
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "opsydyn/governator",
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GOVERNATOR_PUBLISH_CONFIRMATION: "publish-governator-0.2.0",
  };
  await expect(main(["publish", "/nonexistent"], env)).rejects.toThrow(/NPM_TOKEN/i);
  await expect(
    main(["publish", "/nonexistent"], { ...env, GITHUB_REF: "refs/heads/other" }),
  ).rejects.toThrow(/confirmation/i);
});
