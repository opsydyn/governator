/* Private Node-only release I/O boundary. No project dependencies are installed in the credential-bearing job. */
/* oxlint-disable linteffect/no-return-in-arrow, linteffect/no-try-catch, linteffect/no-if-statement, linteffect/no-ternary, linteffect/no-process-env-direct-read, linteffect/no-naked-object-state-update, linteffect/no-string-sentinel-const, linteffect/no-magic-domain-string, linteffect/no-boundary-try-catch-without-effect-map, linteffect/no-throw-in-effect -- Filesystem, subprocess and registry orchestration with explicit failures; no shipped domain code. */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

type PackageRecord = {
  name: string;
  version: string;
  archive: string;
  size: number;
  sha256: string;
  integrity: string;
};
export type ReleaseInventory = { version: string; sourceCommit: string; packages: PackageRecord[] };
export type VerifiedArchive = PackageRecord & { bytes: Buffer };
export type ReleasePort = {
  read(entry: VerifiedArchive): Promise<Uint8Array | null>;
  send(entry: VerifiedArchive): Promise<void>;
};
const names = ["governator-cli", "governator-mcp", "storybook-addon-governator"];
const maxArchive = 16 * 1024 * 1024;
function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function matches(bytes: Uint8Array, entry: PackageRecord) {
  return (
    bytes.length === entry.size &&
    createHash("sha256").update(bytes).digest("hex") === entry.sha256 &&
    `sha512-${createHash("sha512").update(bytes).digest("base64")}` === entry.integrity
  );
}
function checkInventory(inventory: ReleaseInventory) {
  ensure(
    inventory.version === "0.2.0" && /^[a-f0-9]{40}$/.test(inventory.sourceCommit),
    "Invalid release identity",
  );
  ensure(
    Array.isArray(inventory.packages) && inventory.packages.length === 3,
    "Unexpected package set",
  );
  for (const [index, entry] of inventory.packages.entries()) {
    ensure(
      entry.name === `@opsydyn/${names[index]}` &&
        entry.version === inventory.version &&
        entry.archive === `opsydyn-${names[index]}-${inventory.version}.tgz`,
      "Unexpected package set",
    );
    ensure(
      Number.isSafeInteger(entry.size) &&
        entry.size > 0 &&
        entry.size <= maxArchive &&
        /^[a-f0-9]{64}$/.test(entry.sha256) &&
        /^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity),
      "Invalid archive pin",
    );
  }
}
export async function verifyRetained(
  directory: string,
  inventory: ReleaseInventory,
): Promise<VerifiedArchive[]> {
  checkInventory(inventory);
  ensure((await lstat(directory)).isDirectory(), "Archive directory must be a real directory");
  const result: VerifiedArchive[] = [];
  for (const entry of inventory.packages) {
    const file = await open(
      join(directory, entry.archive),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const meta = await file.stat();
      ensure(meta.isFile() && meta.size === entry.size, `Archive size mismatch: ${entry.name}`);
      const bytes = await file.readFile();
      ensure(matches(bytes, entry), `Archive digest mismatch: ${entry.name}`);
      result.push({ ...entry, bytes });
    } finally {
      await file.close();
    }
  }
  return result;
}
export async function releaseArchives(
  input: readonly VerifiedArchive[],
  port: ReleasePort,
  options: { attempts?: number; pause?: () => Promise<void> } = {},
) {
  // Private byte copies for the complete set precede every external call.
  const archives = input.map((entry) => ({ ...entry, bytes: Buffer.from(entry.bytes) }));
  for (const entry of archives)
    ensure(matches(entry.bytes, entry), `Archive digest mismatch: ${entry.name}`);
  const attempts = options.attempts ?? 1;
  ensure(Number.isInteger(attempts) && attempts > 0 && attempts <= 60, "Invalid readback attempts");
  const pause = options.pause ?? (() => new Promise<void>((done) => setTimeout(done, 2000)));
  const states = new Map<string, "already_verified" | "verified">();
  const check = async (entry: VerifiedArchive) => {
    const bytes = await port.read(entry);
    if (bytes === null) return false;
    ensure(matches(bytes, entry), `Conflicting registry bytes: ${entry.name}`);
    return true;
  };
  for (const entry of archives) if (await check(entry)) states.set(entry.name, "already_verified");
  for (const entry of archives) {
    if (states.has(entry.name)) continue;
    if (await check(entry)) {
      states.set(entry.name, "already_verified");
      continue;
    }
    ensure(matches(entry.bytes, entry), `Archive digest mismatch: ${entry.name}`);
    // A send error is uncertain. Stop; the next invocation reads npm before resending.
    await port.send(entry);
    let verified = false;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (await check(entry)) {
        verified = true;
        break;
      }
      if (attempt + 1 < attempts) await pause();
    }
    ensure(verified, `Readback unavailable; inspect npm before resuming: ${entry.name}`);
    states.set(entry.name, "verified");
  }
  return archives.map((entry) => ({
    name: entry.name,
    version: entry.version,
    sha256: entry.sha256,
    state: states.get(entry.name)!,
  }));
}
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
async function limited(response: Response, limit: number) {
  ensure(response.ok && response.body, "Registry response unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      ensure(size <= limit, "Registry response exceeds limit");
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}
export async function readVersion(
  registry: URL,
  entry: PackageRecord,
  fetcher: (input: URL, init?: RequestInit) => Promise<Response> = fetch,
): Promise<Uint8Array | null> {
  ensure(validRegistry(registry), "Unsupported registry");
  const response = await fetcher(
    new URL(`${encodeURIComponent(entry.name)}/${entry.version}`, registry),
    { redirect: "error", signal: AbortSignal.timeout(30000) },
  );
  if (response.status === 404) return null;
  const metadata = JSON.parse((await limited(response, 1024 * 1024)).toString());
  ensure(
    metadata.name === entry.name &&
      metadata.version === entry.version &&
      typeof metadata.dist?.tarball === "string",
    "Wrong registry identity",
  );
  const archive = new URL(metadata.dist.tarball);
  ensure(
    archive.origin === registry.origin && !archive.username && !archive.password && !archive.hash,
    "Untrusted tarball URL",
  );
  return limited(
    await fetcher(archive, { redirect: "error", signal: AbortSignal.timeout(30000) }),
    maxArchive,
  );
}
async function npmCommand(npmPath: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const code = await new Promise<number | null>((done, fail) => {
    const child = spawn(npmPath, args, { cwd, env, stdio: "ignore", shell: false });
    child.once("error", () => fail(new Error("npm could not start")));
    child.once("close", done);
  });
  ensure(
    code === 0,
    "npm command failed or upload acknowledgement is uncertain; inspect npm before resuming",
  );
}
export function createNpmPort(options: {
  registry: URL;
  npmPath: string;
  token?: string;
  dryRun: boolean;
  provenance: boolean;
  env: NodeJS.ProcessEnv;
}): ReleasePort {
  ensure(validRegistry(options.registry), "Unsupported registry");
  ensure(
    !options.provenance || options.registry.href === "https://registry.npmjs.org/",
    "Fixture cannot enable provenance",
  );
  const registry = new URL(options.registry.href);
  return {
    read: (entry) => readVersion(registry, entry),
    async send(entry) {
      ensure(matches(entry.bytes, entry), "Archive digest mismatch before npm");
      const directory = await mkdtemp(join(tmpdir(), "governator-retained-publish-"));
      try {
        const archive = join(directory, entry.archive);
        await writeFile(archive, entry.bytes, { flag: "wx", mode: 0o400 });
        await writeFile(
          join(directory, "npmrc"),
          options.token ? `//${registry.host}/:_authToken=\${NODE_AUTH_TOKEN}\n` : "",
          { flag: "wx", mode: 0o600 },
        );
        await writeFile(join(directory, "global-npmrc"), "", { flag: "wx", mode: 0o600 });
        const env: NodeJS.ProcessEnv = {
          PATH: options.env.PATH,
          HOME: directory,
          TMPDIR: directory,
          CI: "true",
          npm_config_userconfig: join(directory, "npmrc"),
          npm_config_globalconfig: join(directory, "global-npmrc"),
          npm_config_cache: join(directory, "cache"),
          npm_config_fetch_retries: "0",
          npm_config_update_notifier: "false",
          npm_config_registry: registry.href,
        };
        if (options.token) env.NODE_AUTH_TOKEN = options.token;
        if (options.provenance)
          for (const [key, value] of Object.entries(options.env))
            if (key.startsWith("GITHUB_") || key.startsWith("ACTIONS_ID_TOKEN_")) env[key] = value;
        ensure(matches(await readFile(archive), entry), "Staged archive digest mismatch");
        await npmCommand(
          options.npmPath,
          [
            "publish",
            archive,
            "--ignore-scripts",
            "--access=public",
            "--tag=latest",
            `--registry=${registry.href}`,
            `--@opsydyn:registry=${registry.href}`,
            `--provenance=${options.provenance}`,
            ...(options.dryRun ? ["--dry-run"] : []),
          ],
          directory,
          env,
        );
        ensure(
          matches(await readFile(archive), entry),
          "Staged archive changed during npm command",
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}
export async function main(args = process.argv.slice(2), env = process.env) {
  const [mode, directory] = args;
  ensure(
    args.length === 2 && ["verify", "rehearse", "publish"].includes(mode ?? "") && directory,
    "Usage: publish-retained.ts verify|rehearse|publish ARCHIVE_DIRECTORY",
  );
  if (mode === "publish") {
    ensure(
      env.GITHUB_ACTIONS === "true" &&
        env.GITHUB_REPOSITORY === "opsydyn/governator" &&
        env.GITHUB_REF === "refs/heads/main" &&
        env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
        env.GOVERNATOR_PUBLISH_CONFIRMATION === "publish-governator-0.2.0",
      "Live publishing requires explicit main workflow confirmation",
    );
    ensure(
      typeof env.NODE_AUTH_TOKEN === "string" && env.NODE_AUTH_TOKEN.length > 0,
      "NPM_TOKEN is unavailable",
    );
  }
  const inventory = JSON.parse(
    await readFile(new URL("../governance/publishing/0.2.0.json", import.meta.url), "utf8"),
  ) as ReleaseInventory;
  const archives = await verifyRetained(resolve(directory), inventory);
  const registry = new URL("https://registry.npmjs.org/");
  const port = createNpmPort({
    registry,
    npmPath: "npm",
    ...(env.NODE_AUTH_TOKEN ? { token: env.NODE_AUTH_TOKEN } : {}),
    dryRun: mode !== "publish",
    provenance: mode === "publish",
    env,
  });
  if (mode === "rehearse") for (const entry of archives) await port.send(entry);
  const packages =
    mode === "publish"
      ? await releaseArchives(archives, port, { attempts: 60 })
      : archives.map((entry) => ({
          name: entry.name,
          version: entry.version,
          sha256: entry.sha256,
          state: mode === "rehearse" ? "dry_run" : "hash_verified",
        }));
  return {
    mode,
    candidateSource: inventory.sourceCommit,
    packages,
    publication: mode === "publish" ? "readback_verified" : "disabled",
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await main(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Release failed");
    process.exitCode = 1;
  }
}
