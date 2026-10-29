/* Fixture-only npm transport. Mutable staging is not suitable for production archive custody. */
/* oxlint-disable linteffect/no-string-sentinel-const, linteffect/no-return-in-arrow, linteffect/no-try-catch, linteffect/no-if-statement, linteffect/no-magic-domain-string, linteffect/no-process-env-direct-read, linteffect/no-boundary-try-catch-without-effect-map, linteffect/no-naked-object-state-update */
import { spawn } from "node:child_process";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { ensure } from "@governator/core";
import { inspectArchiveForRehearsal } from "./rehearse-single-maintainer.ts";
import type { RegistryPort, RegistryRead } from "../packages/cli/src/single-maintainer-adapter.ts";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
const maxSize = 16 * 1024 * 1024;
function validRegistry(registry: URL) {
  return (
    registry.href === "https://registry.npmjs.org/" ||
    (registry.protocol === "http:" &&
      registry.hostname === "127.0.0.1" &&
      registry.port !== "" &&
      registry.pathname === "/" &&
      !registry.search &&
      !registry.hash &&
      !registry.username &&
      !registry.password)
  );
}
async function limited(response: Response, limit: number): Promise<Uint8Array> {
  ensure(response.ok && response.body !== null, "Registry response unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      ensure(total <= limit, "Registry response exceeds limit");
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Uint8Array.from(Buffer.concat(chunks));
}
export async function readNpmVersion(
  registry: URL,
  name: string,
  version: string,
  fetcher: Fetcher = fetch,
): Promise<RegistryRead> {
  ensure(validRegistry(registry), "Unsupported registry");
  ensure(
    /^@opsydyn\/(governator-cli|governator-mcp|storybook-addon-governator)$/.test(name) &&
      version === "0.1.0",
    "Unexpected package identity",
  );
  const metadata = await fetcher(
    new URL(`${encodeURIComponent(name)}/${encodeURIComponent(version)}`, registry),
    { redirect: "error", signal: AbortSignal.timeout(30000) },
  );
  if (metadata.status === 404) return { status: "absent" };
  const record: unknown = JSON.parse(
    new TextDecoder().decode(await limited(metadata, 1024 * 1024)),
  );
  ensure(typeof record === "object" && record !== null, "Invalid registry metadata");
  const value = record as { name?: unknown; version?: unknown; dist?: { tarball?: unknown } };
  ensure(
    value.name === name && value.version === version && typeof value.dist?.tarball === "string",
    "Invalid package metadata",
  );
  const tarball = new URL(value.dist.tarball);
  ensure(
    tarball.origin === registry.origin && !tarball.username && !tarball.password && !tarball.hash,
    "Untrusted archive URL",
  );
  const response = await fetcher(tarball, {
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  return { status: "present", bytes: await limited(response, maxSize) };
}
export function npmTransport(options: {
  registry: URL;
  npmPath: string;
  token: string;
  provenance: boolean;
  path: string;
}): RegistryPort {
  ensure(
    validRegistry(options.registry) && options.registry.protocol === "http:",
    "Fixture transport requires a loopback registry",
  );
  ensure(isAbsolute(options.npmPath), "npm executable must be absolute");
  ensure(/^[\x21-\x7e]+$/.test(options.token), "Invalid npm token");
  ensure(options.provenance === false, "Fixture transport cannot enable provenance");
  const registry = new URL(options.registry.href);
  return {
    read: (name, version) => readNpmVersion(registry, name, version),
    async send(name, version, input) {
      ensure(
        /^@opsydyn\/(governator-cli|governator-mcp|storybook-addon-governator)$/.test(name) &&
          version === "0.1.0",
        "Unexpected package identity",
      );
      ensure(input.byteLength > 0 && input.byteLength <= maxSize, "Invalid archive size");
      const snapshot = Uint8Array.from(input);
      await inspectArchiveForRehearsal(snapshot, name);
      const hash = new Bun.CryptoHasher("sha256").update(snapshot).digest("hex");
      const dir = await mkdtemp(join(tmpdir(), "governator-npm-stage-"));
      const archive = join(dir, "candidate.tgz");
      const config = join(dir, "npmrc");
      const globalConfig = join(dir, "global-npmrc");
      try {
        const handle = await open(archive, "wx", 0o400);
        try {
          await handle.writeFile(snapshot);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await writeFile(config, `//${registry.host}/:_authToken=${options.token}\n`, {
          flag: "wx",
          mode: 0o600,
        });
        await writeFile(globalConfig, "", { flag: "wx", mode: 0o600 });
        ensure(
          new Bun.CryptoHasher("sha256").update(await readFile(archive)).digest("hex") === hash,
          "Staged archive changed",
        );
        const code = await new Promise<number | null>((resolve, reject) => {
          const child = spawn(
            options.npmPath,
            [
              "publish",
              archive,
              "--registry",
              registry.href,
              `--@opsydyn:registry=${registry.href}`,
              "--ignore-scripts",
              "--access=public",
              `--provenance=${options.provenance}`,
            ],
            {
              cwd: dir,
              env: {
                PATH: options.path,
                HOME: dir,
                TMPDIR: dir,
                CI: "1",
                npm_config_userconfig: config,
                npm_config_globalconfig: globalConfig,
                npm_config_cache: join(dir, "cache"),
                npm_config_registry: registry.href,
                npm_config_fetch_retries: "0",
                npm_config_update_notifier: "false",
              },
              stdio: "ignore",
            },
          );
          child.once("error", reject);
          child.once("close", resolve);
        });
        ensure(code === 0, "npm transfer did not complete successfully");
        ensure(
          new Bun.CryptoHasher("sha256").update(await readFile(archive)).digest("hex") === hash,
          "Staged archive changed during transfer",
        );
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
