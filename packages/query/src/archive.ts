import { assertSafeApi } from "./api-safety.ts";
import { Parser } from "tar";
import type { ReadEntry } from "tar";
import { ensure, decode, digest } from "@governator/core";
import { snapshotApi, PackageManifest } from "@governator/versioning";
import type { ApiConfig, ReleaseArtifact } from "@governator/versioning";
export function bytesDigest(bytes: Uint8Array): string {
  return `sha256:${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}`;
}
export async function inspectArchive(
  bytes: Uint8Array,
  config: ApiConfig,
  declarationPath: string,
  safeDeclarations = false,
): Promise<ReleaseArtifact> {
  ensure(
    bytes.length > 0 && bytes.length <= 4 * 1024 * 1024,
    "Candidate archive compressed size exceeds limit (4 MiB)",
  );
  const files = new Map<string, Uint8Array>();
  const modes = new Map<string, number>();
  let total = 0,
    count = 0;
  await new Promise<void>((resolve, reject) => {
    const parser = new Parser({
      strict: true,
      maxMetaEntrySize: 16 * 1024,
      maxDecompressionRatio: 128,
    });
    parser.on("error", reject);
    parser.on("end", resolve);
    function readEntry(entry: ReadEntry) {
      count++;
      const path = entry.path;
      if (entry.type === "Directory" && (path === "package/" || path === "package")) {
        entry.resume();
        return;
      }
      const parts = path.replace(/\/$/, "").split("/");
      if (
        count > 2048 ||
        parts[0] !== "package" ||
        parts.length < 2 ||
        parts.some((p) => p === "" || p === "." || p === ".." || p.includes("\\")) ||
        path.includes("\0")
      ) {
        parser.abort(new Error("Unsafe or excessive archive entry"));
        entry.resume();
        return;
      }
      if (entry.type === "Directory") {
        entry.resume();
        return;
      }
      if (entry.type !== "File" || entry.linkpath || files.has(parts.slice(1).join("/"))) {
        parser.abort(
          new Error("Only unique regular file entries are supported; links are forbidden"),
        );
        entry.resume();
        return;
      }
      total += entry.size;
      if (entry.size > 4 * 1024 * 1024 || total > 16 * 1024 * 1024) {
        parser.abort(new Error("Archive expanded size exceeds limit"));
        entry.resume();
        return;
      }
      modes.set(parts.slice(1).join("/"), entry.mode ?? 0);
      const chunks: Buffer[] = [];
      entry.on("data", (chunk: Buffer) => chunks.push(chunk));
      entry.on("end", () => files.set(parts.slice(1).join("/"), Buffer.concat(chunks)));
    }
    parser.on("entry", readEntry);
    parser.end(Buffer.from(bytes));
  });
  ensure(files.size > 0, "Empty candidate archive");
  const json = files.get("package.json");
  ensure(!!json, "Missing packed package.json");
  const raw = JSON.parse(new TextDecoder().decode(json));
  const manifest = decode(PackageManifest, {
    name: raw.name,
    version: raw.version,
    type: raw.type ?? "commonjs",
    exports: raw.exports,
    peerDependencies: raw.peerDependencies ?? {},
    dependencies: raw.dependencies ?? {},
  });
  ensure(
    manifest.name === config.packageId && manifest.version === config.packageVersion,
    "Packed package identity/version differs from API config",
  );
  function target(value: unknown): void {
    if (typeof value === "string")
      ensure(
        value.startsWith("./") && !value.includes("*") && files.has(value.slice(2)),
        `Missing or unsupported packed export target: ${value}`,
      );
    else if (value !== null && typeof value === "object")
      for (const child of Object.values(value)) target(child);
    else ensure(value === null, "Invalid export target");
  }
  ensure(
    manifest.exports !== undefined && manifest.exports !== null,
    "An explicit exports map is required",
  );
  target(manifest.exports);
  for (const value of Object.values(manifest.dependencies))
    ensure(
      !/^(workspace:|file:|link:)/.test(value),
      "Packed runtime dependencies must not use local workspace/file links",
    );
  const declaration = files.get(declarationPath);
  ensure(!!declaration, "Missing packed API declaration");
  // Public declaration must be reachable through an exported type target, not a private decoy.
  ensure(
    typeof manifest.exports === "object" &&
      manifest.exports !== null &&
      !Array.isArray(manifest.exports) &&
      Object.keys(manifest.exports).every((key) => key === "." || key === "./package.json") &&
      typeof (manifest.exports as Record<string, unknown>)["."] === "object" &&
      (manifest.exports as { "."?: { types?: unknown } })["."]?.types === "./" + declarationPath,
    "Single-entrypoint API declaration must be the actual root types export; additional entrypoints are unsupported",
  );
  const hashes: Record<string, string> = Object.create(null);
  for (const [path, content] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b)))
    hashes[path] = digest({ bytes: bytesDigest(content), mode: modes.get(path) });
  if (safeDeclarations) assertSafeApi(new TextDecoder().decode(declaration));
  return {
    schemaVersion: 1,
    artifactDigest: bytesDigest(bytes),
    manifest,
    api: snapshotApi(new TextDecoder().decode(declaration), config),
    files: hashes,
  };
}
