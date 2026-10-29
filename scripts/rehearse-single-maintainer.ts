/* Local operator adapter. Archive reads and writes are filesystem boundaries; no registry or credentials are used. */
/* oxlint-disable linteffect/no-return-in-arrow, linteffect/no-try-catch, linteffect/no-string-sentinel-const, linteffect/no-process-env-direct-read, linteffect/no-naked-object-state-update */
import { constants } from "node:fs";
import { open, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { Parser } from "tar";
import type { ReadEntry } from "tar";
import { ensure } from "@governator/core";
import { cleanHead } from "../packages/cli/src/source.ts";
import {
  candidateDigest,
  createCandidate,
  rehearseCandidate,
} from "../packages/cli/src/first-release-rehearsal.ts";
import type { Archive } from "../packages/cli/src/first-release-rehearsal.ts";

const names = ["governator-cli", "governator-mcp", "storybook-addon-governator"] as const;
export async function readRegular(path: string): Promise<Uint8Array> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const meta = await file.stat();
    ensure(
      meta.isFile() && meta.size > 0 && meta.size <= 16 * 1024 * 1024,
      `Invalid archive or record: ${path}`,
    );
    return await file.readFile();
  } finally {
    await file.close();
  }
}
export async function inspectArchiveForRehearsal(
  bytes: Uint8Array,
  expectedName: string,
): Promise<void> {
  ensure(
    bytes.length >= 3 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 8,
    "Expected a gzip-compressed npm archive",
  );
  let count = 0,
    total = 0;
  let manifest: Uint8Array | undefined;
  const paths = new Set<string>();
  await new Promise<void>((resolve, reject) => {
    const parser = new Parser({
      strict: true,
      maxMetaEntrySize: 16 * 1024,
      maxDecompressionRatio: 128,
    });
    parser.on("error", reject);
    parser.on("ignoredEntry", () => parser.abort(new Error("Unsupported archive entry")));
    parser.on("end", resolve);
    parser.on("entry", (entry: ReadEntry) => {
      const path = entry.path;
      if (entry.type === "Directory" && (path === "package" || path === "package/")) {
        entry.resume();
        return;
      }
      const parts = path.replace(/\/$/, "").split("/");
      if (
        ++count > 2048 ||
        parts[0] !== "package" ||
        parts.length < 2 ||
        parts.some((part) => !part || part === "." || part === ".." || part.includes("\\")) ||
        path.includes("\0")
      ) {
        parser.abort(new Error("Unsafe archive path"));
        entry.resume();
        return;
      }
      if (entry.type === "Directory") {
        entry.resume();
        return;
      }
      total += entry.size;
      if (
        entry.type !== "File" ||
        entry.linkpath ||
        paths.has(path) ||
        entry.size > 16 * 1024 * 1024 ||
        total > 32 * 1024 * 1024
      ) {
        parser.abort(new Error("Unsafe or excessive archive entry"));
        entry.resume();
        return;
      }
      paths.add(path);
      if (path !== "package/package.json") {
        entry.resume();
        return;
      }
      const chunks: Buffer[] = [];
      entry.on("data", (chunk: Buffer) => chunks.push(chunk));
      entry.on("end", () => {
        manifest = Buffer.concat(chunks);
      });
    });
    parser.end(Buffer.from(bytes));
  });
  ensure(manifest !== undefined, "Archive is missing its package manifest");
  const data = JSON.parse(new TextDecoder().decode(manifest));
  ensure(
    data.name === expectedName && data.version === "0.1.0" && data.private !== true,
    `Wrong packed identity for ${expectedName}`,
  );
  if (data.publishConfig !== undefined) {
    ensure(
      typeof data.publishConfig === "object" &&
        data.publishConfig !== null &&
        !Array.isArray(data.publishConfig),
      "Unsafe publishConfig",
    );
    ensure(
      Object.keys(data.publishConfig).every((key) => key === "access" || key === "provenance"),
      "Unsafe publishConfig options",
    );
    ensure(
      (data.publishConfig.access === undefined || data.publishConfig.access === "public") &&
        (data.publishConfig.provenance === undefined ||
          typeof data.publishConfig.provenance === "boolean"),
      "Unsafe publishConfig values",
    );
  }
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const value of Object.values(data[field] ?? {}))
      ensure(
        typeof value === "string" && !/^(workspace:|file:|link:)/.test(value),
        "Local dependency in packed manifest",
      );
  }
  for (const required of ["package/README.md", "package/LICENSE", "package/THIRD_PARTY_NOTICES.md"])
    ensure(paths.has(required), `Missing ${required}`);
}
export async function loadArchives(directory: string): Promise<Archive[]> {
  const result: Archive[] = [];
  for (const name of names) {
    const bytes = await readRegular(join(directory, `opsydyn-${name}-0.1.0.tgz`));
    const fullName = `@opsydyn/${name}`;
    await inspectArchiveForRehearsal(bytes, fullName);
    result.push({ name: fullName, version: "0.1.0", bytes });
  }
  return result;
}
export async function assertEmptyFirstReleaseQueue(root: string): Promise<void> {
  const active = (await readdir(join(root, ".changeset"))).filter(
    (file) => file.endsWith(".md") && file !== "README.md",
  );
  ensure(
    active.length === 0,
    "First release requires an empty active Changesets queue; version pending changes before capture",
  );
}
async function main() {
  const [action, directory, digest] = process.argv.slice(2);
  ensure(
    isAbsolute(directory ?? ""),
    "Provide an absolute directory containing the three npm-packed archives",
  );
  ensure(
    action === "capture" || action === "rehearse",
    "Use capture <absolute-directory> or rehearse <absolute-directory> <reviewed-digest>",
  );
  const root = process.cwd();
  const commit = cleanHead(root);
  await assertEmptyFirstReleaseQueue(root);
  const archives = await loadArchives(directory!);
  ensure(cleanHead(root) === commit, "Source changed during archive inspection");
  const recordPath = join(directory!, "candidate.json");
  if (action === "capture") {
    const candidate = createCandidate(commit, archives);
    await writeFile(recordPath, JSON.stringify(candidate, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      JSON.stringify(
        {
          mode: "local-capture",
          sourceCommit: commit,
          candidate: recordPath,
          reviewDigest: candidateDigest(candidate),
          publication: "disabled",
        },
        null,
        2,
      ),
    );
  } else {
    ensure(
      typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest),
      "Provide the reviewed candidate digest",
    );
    const candidate = JSON.parse(new TextDecoder().decode(await readRegular(recordPath)));
    const receipt = await rehearseCandidate(candidate, digest, commit, archives);
    ensure(cleanHead(root) === commit, "Source changed during rehearsal");
    await writeFile(join(directory!, "rehearsal.json"), JSON.stringify(receipt, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log(JSON.stringify(receipt, null, 2));
  }
}
if (import.meta.main) await main();
