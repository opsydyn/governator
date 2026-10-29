/* Sealed publisher preparation. Nothing runs unless explicitly invoked by an authorized caller. */
/* oxlint-disable linteffect/no-if-statement, linteffect/no-return-in-arrow, linteffect/no-string-sentinel-const, linteffect/no-try-catch, linteffect/no-naked-object-state-update, linteffect/no-process-env-direct-read, linteffect/no-magic-domain-string, linteffect/no-boundary-try-catch-without-effect-map -- Release IO and process boundaries. */
import { spawn } from "node:child_process";
import {
  chmod,
  chown,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { ensure } from "@governator/core";
import { candidateDigest } from "../packages/cli/src/first-release-rehearsal.ts";
import { loadArchives, readRegular } from "./rehearse-single-maintainer.ts";
import { runDurableRelease } from "./durable-release.ts";
import { withJournalLock } from "./release-journal.ts";
import { sealedNpmPort } from "./sealed-production-port.ts";
import { checkpointedJournal } from "./checkpoint-journal.ts";
import type { CheckpointPort } from "./checkpoint-journal.ts";

type ArtifactIdentity = {
  artifactId: string;
  runId: string;
  runAttempt: string;
  sourceCommit: string;
  repositoryId: string;
  kind: "candidate" | "attestation";
};
function numeric(value: unknown): string {
  ensure(
    typeof value === "number" && Number.isSafeInteger(value) && value > 0,
    "Invalid GitHub ID",
  );
  return String(value);
}
export function validateArtifactMetadata(value: unknown, expected: ArtifactIdentity): void {
  ensure(typeof value === "object" && value !== null, "Invalid artifact metadata");
  const artifact = value as {
    id: unknown;
    name: unknown;
    expired: unknown;
    digest: unknown;
    workflow_run?: {
      id: unknown;
      head_branch: unknown;
      head_sha: unknown;
      repository_id: unknown;
      head_repository_id: unknown;
    };
  };
  const run = artifact.workflow_run;
  ensure(
    numeric(artifact.id) === expected.artifactId &&
      artifact.name === `governator-${expected.kind}-${expected.runId}-${expected.runAttempt}` &&
      artifact.expired === false &&
      typeof artifact.digest === "string" &&
      /^sha256:[a-f0-9]{64}$/.test(artifact.digest),
    "Artifact identity mismatch",
  );
  ensure(
    run !== undefined &&
      numeric(run!.id) === expected.runId &&
      run!.head_branch === "main" &&
      run!.head_sha === expected.sourceCommit &&
      numeric(run!.repository_id) === expected.repositoryId &&
      numeric(run!.head_repository_id) === expected.repositoryId,
    "Artifact source mismatch",
  );
}

export function validateQualificationRun(value: unknown, expected: ArtifactIdentity): void {
  ensure(typeof value === "object" && value !== null, "Invalid qualification run");
  const run = value as {
    id: unknown;
    run_attempt: unknown;
    path: unknown;
    event: unknown;
    head_branch: unknown;
    head_sha: unknown;
    status: unknown;
    conclusion: unknown;
    repository?: { id: unknown };
    head_repository?: { id: unknown };
  };
  ensure(
    numeric(run.id) === expected.runId &&
      numeric(run.run_attempt) === expected.runAttempt &&
      run.path === ".github/workflows/release-qualification.yml" &&
      run.event === "workflow_dispatch" &&
      run.head_branch === "main" &&
      run.head_sha === expected.sourceCommit &&
      run.status === "completed" &&
      run.conclusion === "success" &&
      numeric(run.repository?.id) === expected.repositoryId &&
      numeric(run.head_repository?.id) === expected.repositoryId,
    "Qualification run mismatch",
  );
}

type PublisherInput = {
  journalDir: string;
  stagingRoot: string;
  candidateDigest: string;
  sourceCommit: string;
  artifactId: string;
  attestationArtifactId: string;
  qualificationRunId: string;
  qualificationAttempt: string;
  githubToken: string;
  npmToken: string;
  npmPath: string;
  npmRoot: string;
  toolDigests: {
    node: string;
    python: string;
    gh: string;
    bridge: string;
    bridgeModule: string;
    decoder: string;
    npmTree: string;
  };
  nodePath: string;
  ghPath: string;
  bridgePath: string;
  decoderPath: string;
  provenance: Readonly<Record<string, string>>;
  confirmedAbsent: readonly string[];
};

async function githubJson(path: string, token: string): Promise<unknown> {
  const response = await fetch(`https://api.github.com/repos/opsydyn/governator/${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  ensure(response.ok && response.body !== null, "GitHub evidence unavailable");
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      ensure(size <= 1024 * 1024, "GitHub evidence exceeds limit");
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function verifyAttestation(
  ghPath: string,
  archive: string,
  bundle: string,
  source: string,
  token: string,
  home: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ghPath,
      [
        "attestation",
        "verify",
        archive,
        "--bundle",
        bundle,
        "--repo",
        "opsydyn/governator",
        "--signer-workflow",
        "opsydyn/governator/.github/workflows/release-qualification.yml",
        "--source-ref",
        "refs/heads/main",
        "--source-digest",
        source,
      ],
      {
        env: { PATH: "/usr/bin:/bin", HOME: home, GH_TOKEN: token, GH_PROMPT_DISABLED: "1" },
        uid: 65534,
        gid: 65534,
        stdio: "ignore",
      },
    );
    const timer = setTimeout(() => child.kill("SIGKILL"), 60000);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Attestation verification unavailable"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error("Attestation verification failed"));
    });
  });
}

export function validateDecodedNames(
  kind: "candidate" | "attestation",
  names: readonly string[],
): void {
  const expected =
    kind === "attestation"
      ? ["attestation.jsonl"]
      : [
          "candidate.json",
          "SHA256SUMS",
          "opsydyn-governator-cli-0.1.0.tgz",
          "opsydyn-governator-mcp-0.1.0.tgz",
          "opsydyn-storybook-addon-governator-0.1.0.tgz",
        ];
  ensure(
    JSON.stringify([...names].sort()) === JSON.stringify(expected.sort()),
    "Unexpected decoded artifact entries",
  );
}

export function canTraverseUnprivileged(mode: number): boolean {
  return (mode & 0o001) !== 0;
}

async function trustedRootDirectory(path: string, privateDirectory: boolean): Promise<void> {
  ensure(
    isAbsolute(path) && (await realpath(path)) === resolve(path),
    "Root directory must have no symlink ancestors",
  );
  let current = path;
  while (true) {
    const meta = await lstat(current);
    ensure(
      meta.isDirectory() && !meta.isSymbolicLink() && meta.uid === 0 && (meta.mode & 0o022) === 0,
      "Release directory ancestry is not root controlled",
    );
    if (!privateDirectory)
      ensure(
        canTraverseUnprivileged(meta.mode),
        "Staging ancestry must be traversable by the verifier",
      );
    if (current === path && privateDirectory)
      ensure((meta.mode & 0o077) === 0, "Journal directory must be private");
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

async function trustedRootFile(path: string): Promise<string> {
  ensure(isAbsolute(path), "Absolute trusted file path required");
  const resolved = await realpath(path);
  let current = resolved;
  while (true) {
    const meta = await lstat(current);
    ensure(
      meta.uid === 0 && (meta.mode & 0o022) === 0 && !meta.isSymbolicLink(),
      "Release tool or ancestor is not root controlled",
    );
    if (current === resolved) ensure(meta.isFile(), "Release tool must be a regular file");
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolved;
}

export function containsPublisherUid(status: string): boolean {
  const match = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m.exec(status);
  ensure(match !== null, "Invalid process identity record");
  return match!.slice(1).some((uid) => uid === "65534");
}

async function requireUnusedPublisherUid(): Promise<void> {
  for (const pid of (await readdir("/proc")).filter((name) => /^[0-9]+$/.test(name))) {
    try {
      const status = await readFile(`/proc/${pid}/status`, "utf8");
      ensure(!containsPublisherUid(status), "Publishing UID is already in use");
    } catch (error) {
      if (["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) continue;
      throw error;
    }
  }
}

export function verifyToolDigest(bytes: Uint8Array, digest: string): void {
  ensure(
    /^sha256:[a-f0-9]{64}$/.test(digest) &&
      `sha256:${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}` === digest,
    "Release tool digest mismatch",
  );
}

async function verifyTrustedFileDigest(path: string, digest: string): Promise<void> {
  const meta = await lstat(path);
  ensure(
    meta.isFile() && meta.size > 0 && meta.size <= 256 * 1024 * 1024,
    "Invalid release tool size",
  );
  verifyToolDigest(await readFile(path), digest);
}

export async function hashNpmTree(root: string): Promise<string> {
  const entries: Array<[string, string]> = [];
  let total = 0;
  async function visit(path: string, relative: string): Promise<void> {
    const meta = await lstat(path);
    ensure(
      !meta.isSymbolicLink() && meta.uid === process.getuid?.() && (meta.mode & 0o022) === 0,
      "Untrusted npm tree entry",
    );
    ensure(entries.length < 100000, "npm tree exceeds entry limit");
    if (meta.isDirectory()) {
      entries.push([relative, "directory"]);
      for (const name of (await readdir(path)).sort())
        await visit(join(path, name), relative ? `${relative}/${name}` : name);
      return;
    }
    ensure(meta.isFile() && meta.size <= 64 * 1024 * 1024, "Invalid npm tree file");
    total += meta.size;
    ensure(total <= 512 * 1024 * 1024, "npm tree exceeds size limit");
    const data = await readFile(path);
    ensure(data.length === meta.size, "npm tree changed while hashing");
    entries.push([relative, new Bun.CryptoHasher("sha256").update(data).digest("hex")]);
  }
  await visit(root, "");
  return `sha256:${new Bun.CryptoHasher("sha256").update(JSON.stringify(entries)).digest("hex")}`;
}

async function capture(
  command: string,
  args: string[],
  env: Record<string, string>,
  input: Uint8Array | undefined,
  max: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      uid: 65534,
      gid: 65534,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const chunks: Uint8Array[] = [];
    let size = 0;
    let exceeded = false;
    const timer = setTimeout(() => child.kill("SIGKILL"), 90000);
    child.stdout.on("data", (chunk: Uint8Array) => {
      size += chunk.byteLength;
      if (size > max) {
        exceeded = true;
        child.kill("SIGKILL");
      } else chunks.push(chunk);
    });
    child.stdin.once("error", () => {});
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Evidence subprocess unavailable"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && !exceeded) resolve(Uint8Array.from(Buffer.concat(chunks)));
      else reject(new Error("Evidence subprocess failed"));
    });
    child.stdin.end(input);
  });
}

async function downloadArtifact(
  gh: string,
  id: string,
  metadata: unknown,
  token: string,
  home: string,
): Promise<Uint8Array> {
  const digest = (metadata as { digest: string }).digest;
  const bytes = await capture(
    gh,
    ["api", `repos/opsydyn/governator/actions/artifacts/${id}/zip`],
    { PATH: "/usr/bin:/bin", HOME: home, GH_TOKEN: token, GH_PROMPT_DISABLED: "1" },
    undefined,
    64 * 1024 * 1024,
  );
  verifyArtifactDigest(bytes, digest);
  return bytes;
}

async function decodeArtifact(
  decoder: string,
  kind: "candidate" | "attestation",
  zip: Uint8Array,
  home: string,
): Promise<Record<string, Uint8Array>> {
  const output = await capture(
    "/usr/bin/python3",
    [decoder, kind],
    { PATH: "/usr/bin:/bin", HOME: home },
    zip,
    96 * 1024 * 1024,
  );
  const record: unknown = JSON.parse(new TextDecoder().decode(output));
  ensure(
    typeof record === "object" && record !== null && !Array.isArray(record),
    "Invalid decoded artifact",
  );
  validateDecodedNames(kind, Object.keys(record));
  return Object.fromEntries(
    Object.entries(record as Record<string, unknown>).map(([name, value]) => {
      ensure(
        typeof value === "string" && /^[A-Za-z0-9+/]*={0,2}$/.test(value),
        "Invalid decoded artifact entry",
      );
      return [name, Uint8Array.from(Buffer.from(value as string, "base64"))];
    }),
  );
}

function requireQualifiedRecovery(): void {
  throw new Error(
    "Sealed publisher disabled: authoritative checkpoint recovery and runner isolation are not qualified",
  );
}

/** Prototype only: recovery and runner isolation are not yet qualified. */
export async function runSealedPublisher(input: PublisherInput, checkpoints: CheckpointPort) {
  requireQualifiedRecovery();
  input = structuredClone(input);
  ensure(process.platform === "linux" && process.getuid?.() === 0, "Linux root publisher required");
  ensure(typeof process.setgroups === "function", "Supplementary group isolation unavailable");
  process.setgroups!([]);
  ensure(
    [
      input.journalDir,
      input.npmPath,
      input.npmRoot,
      input.nodePath,
      input.ghPath,
      input.bridgePath,
      input.decoderPath,
    ].every(isAbsolute),
    "Absolute paths required",
  );
  await requireUnusedPublisherUid();
  await trustedRootDirectory(input.journalDir, true);
  await trustedRootDirectory(input.stagingRoot, false);
  await trustedRootDirectory(input.npmRoot, false);
  const [npmPath, nodePath, ghPath, bridgePath, decoderPath] = await Promise.all(
    [input.npmPath, input.nodePath, input.ghPath, input.bridgePath, input.decoderPath].map(
      trustedRootFile,
    ),
  );
  const pythonPath = await trustedRootFile("/usr/bin/python3");
  const bridgeModule = await trustedRootFile(join(dirname(bridgePath!), "sealed-npm.py"));
  ensure(npmPath!.startsWith(`${input.npmRoot}/`), "npm executable is outside its pinned tree");
  await Promise.all([
    verifyTrustedFileDigest(nodePath!, input.toolDigests.node),
    verifyTrustedFileDigest(pythonPath, input.toolDigests.python),
    verifyTrustedFileDigest(ghPath!, input.toolDigests.gh),
    verifyTrustedFileDigest(bridgePath!, input.toolDigests.bridge),
    verifyTrustedFileDigest(bridgeModule, input.toolDigests.bridgeModule),
    verifyTrustedFileDigest(decoderPath!, input.toolDigests.decoder),
  ]);
  ensure(
    (await hashNpmTree(input.npmRoot)) === input.toolDigests.npmTree,
    "npm tree digest mismatch",
  );
  ensure(
    /^[a-f0-9]{40}$/.test(input.sourceCommit) && /^[a-f0-9]{64}$/.test(input.candidateDigest),
    "Invalid candidate identity",
  );
  ensure(
    [
      input.artifactId,
      input.attestationArtifactId,
      input.qualificationRunId,
      input.qualificationAttempt,
      input.provenance.GITHUB_REPOSITORY_ID,
    ].every((v) => typeof v === "string" && /^[1-9][0-9]{0,19}$/.test(v)),
    "Invalid GitHub identity",
  );
  ensure(
    input.provenance.GITHUB_SHA === input.sourceCommit,
    "Publisher source does not match candidate",
  );
  ensure(/^[\x21-\x7e]{1,4096}$/.test(input.githubToken), "Invalid GitHub token");
  const expected: ArtifactIdentity = {
    artifactId: input.artifactId,
    runId: input.qualificationRunId,
    runAttempt: input.qualificationAttempt,
    sourceCommit: input.sourceCommit,
    repositoryId: input.provenance.GITHUB_REPOSITORY_ID!,
    kind: "candidate",
  };
  const [run, candidateMeta, attestationMeta] = await Promise.all([
    githubJson(`actions/runs/${expected.runId}`, input.githubToken),
    githubJson(`actions/artifacts/${expected.artifactId}`, input.githubToken),
    githubJson(`actions/artifacts/${input.attestationArtifactId}`, input.githubToken),
  ]);
  validateQualificationRun(run, expected);
  validateArtifactMetadata(candidateMeta, expected);
  validateArtifactMetadata(attestationMeta, {
    ...expected,
    artifactId: input.attestationArtifactId,
    kind: "attestation",
  });
  const verifiedRoot = await mkdtemp(join(input.stagingRoot, "governator-verified-"));
  try {
    await chmod(verifiedRoot, 0o711);
    const home = join(verifiedRoot, "home");
    await mkdir(home, { mode: 0o700 });
    await chmod(home, 0o700);
    await chown(home, 65534, 65534);
    const [candidateZip, attestationZip] = await Promise.all([
      downloadArtifact(ghPath!, input.artifactId, candidateMeta, input.githubToken, home),
      downloadArtifact(
        ghPath!,
        input.attestationArtifactId,
        attestationMeta,
        input.githubToken,
        home,
      ),
    ]);
    const [candidateFiles, attestationFiles] = await Promise.all([
      decodeArtifact(decoderPath!, "candidate", candidateZip, home),
      decodeArtifact(decoderPath!, "attestation", attestationZip, home),
    ]);
    const candidateDir = join(verifiedRoot, "candidate");
    await mkdir(candidateDir, { mode: 0o711 });
    await chmod(candidateDir, 0o711);
    for (const [name, bytes] of Object.entries(candidateFiles)) {
      const target = join(candidateDir, name);
      await writeFile(target, bytes, { flag: "wx", mode: 0o444 });
      await chmod(target, 0o444);
    }
    const bundle = join(verifiedRoot, "attestation.jsonl");
    ensure(attestationFiles["attestation.jsonl"] !== undefined, "Missing attestation bundle");
    await writeFile(bundle, attestationFiles["attestation.jsonl"]!, { flag: "wx", mode: 0o444 });
    await chmod(bundle, 0o444);
    const candidate = JSON.parse(
      new TextDecoder().decode(await readRegular(join(candidateDir, "candidate.json"))),
    );
    ensure(candidateDigest(candidate) === input.candidateDigest, "Candidate digest mismatch");
    const archives = await loadArchives(candidateDir);
    for (const entry of archives) {
      const archivePath = join(candidateDir, `opsydyn-${entry.name.split("/")[1]}-0.1.0.tgz`);
      await verifyAttestation(
        ghPath!,
        archivePath,
        bundle,
        input.sourceCommit,
        input.githubToken,
        home,
      );
    }
    const port = sealedNpmPort({
      registry: new URL("https://registry.npmjs.org/"),
      expectedCommit: input.sourceCommit,
      token: input.npmToken,
      npm: npmPath!,
      node: nodePath!,
      bridge: bridgePath!,
      provenance: input.provenance,
      confirmedAbsent: input.confirmedAbsent,
    });
    return await withJournalLock(input.journalDir, (store) =>
      runDurableRelease(
        {
          candidate,
          digest: input.candidateDigest,
          sourceCommit: input.sourceCommit,
          artifactId: input.artifactId,
        },
        archives,
        checkpointedJournal(store, checkpoints),
        port,
      ),
    );
  } finally {
    await rm(verifiedRoot, { recursive: true, force: true });
  }
}

export function verifyArtifactDigest(bytes: Uint8Array, digest: string): void {
  ensure(
    /^sha256:[a-f0-9]{64}$/.test(digest) &&
      `sha256:${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}` === digest,
    "Artifact ZIP digest mismatch",
  );
}
