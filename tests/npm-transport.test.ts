/* oxlint-disable linteffect/no-try-catch */
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create } from "tar";
import { npmTransport } from "../scripts/npm-transport.ts";
import { describe, expect, test } from "vitest";
import { readNpmVersion } from "../scripts/npm-transport.ts";

describe("npm registry observation", () => {
  const base = new URL("https://registry.npmjs.org/");
  test("recognizes an absent version", async () => {
    const result = await readNpmVersion(
      base,
      "@opsydyn/governator-cli",
      "0.1.0",
      async () => new Response(null, { status: 404 }),
    );
    expect(result).toEqual({ status: "absent" });
  });
  test("reads exact tarball bytes from the same registry", async () => {
    const fetcher = async (url: string | URL | Request) =>
      String(url).endsWith("0.1.0")
        ? Response.json({
            name: "@opsydyn/governator-cli",
            version: "0.1.0",
            dist: { tarball: "https://registry.npmjs.org/@opsydyn/governator-cli/-/cli-0.1.0.tgz" },
          })
        : new Response(Uint8Array.from([1, 2, 3]));
    expect(await readNpmVersion(base, "@opsydyn/governator-cli", "0.1.0", fetcher)).toEqual({
      status: "present",
      bytes: Uint8Array.from([1, 2, 3]),
    });
  });
  test("refuses cross-origin archives and malformed metadata", async () => {
    const fetcher = async () =>
      Response.json({
        name: "@opsydyn/governator-cli",
        version: "0.1.0",
        dist: { tarball: "https://example.com/archive.tgz" },
      });
    await expect(
      readNpmVersion(base, "@opsydyn/governator-cli", "0.1.0", fetcher),
    ).rejects.toThrow();
    await expect(
      readNpmVersion(base, "@opsydyn/governator-cli", "0.1.0", async () => Response.json({})),
    ).rejects.toThrow();
  });
});

test("rejects redirects, errors, and oversized responses", async () => {
  const registry = new URL("https://registry.npmjs.org/");
  await expect(
    readNpmVersion(
      registry,
      "@opsydyn/governator-cli",
      "0.1.0",
      async () => new Response(null, { status: 302, headers: { location: "https://example.com" } }),
    ),
  ).rejects.toThrow();
  await expect(
    readNpmVersion(
      registry,
      "@opsydyn/governator-cli",
      "0.1.0",
      async () => new Response(null, { status: 503 }),
    ),
  ).rejects.toThrow();
  await expect(
    readNpmVersion(
      registry,
      "@opsydyn/governator-cli",
      "0.1.0",
      async () => new Response(new Uint8Array(1024 * 1024 + 1)),
    ),
  ).rejects.toThrow();
});

test("rejects archive publishConfig routing before starting npm", async () => {
  const dir = await mkdtemp(join(tmpdir(), "governator-route-test-"));
  try {
    await mkdir(join(dir, "package"));
    await writeFile(
      join(dir, "package/package.json"),
      JSON.stringify({
        name: "@opsydyn/governator-cli",
        version: "0.1.0",
        publishConfig: { "@opsydyn:registry": "https://example.com/" },
      }),
    );
    for (const name of ["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"])
      await writeFile(join(dir, "package", name), "test");
    await create({ gzip: true, cwd: dir, file: join(dir, "candidate.tgz") }, ["package"]);
    const port = npmTransport({
      registry: new URL("https://registry.npmjs.org/"),
      npmPath: "/nonexistent/npm",
      token: "dummy",
      provenance: false,
      path: "/usr/bin:/bin",
    });
    await expect(
      port.send("@opsydyn/governator-cli", "0.1.0", await readFile(join(dir, "candidate.tgz"))),
    ).rejects.toThrow(/publishConfig/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
