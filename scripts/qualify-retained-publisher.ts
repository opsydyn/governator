/* Local fixture only. Run under sandbox-exec with external network denied. No live registry or real credentials. */
/* oxlint-disable linteffect/no-return-in-arrow, linteffect/no-try-catch, linteffect/no-if-statement, linteffect/no-ternary, linteffect/no-process-env-direct-read, linteffect/no-naked-object-state-update, linteffect/no-string-sentinel-const, linteffect/no-magic-domain-string, linteffect/no-boundary-try-catch-without-effect-map -- Private subprocess/network qualification boundary. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { verifyRetained, createNpmPort, releaseArchives } from "./publish-retained.ts";
import type { ReleaseInventory } from "./publish-retained.ts";

const [directory, output] = process.argv.slice(2);
assert(directory && output, "Provide retained archive directory and new receipt path");
const denial = await new Promise<string>((done, fail) => {
  const socket = createConnection({ host: "192.0.2.1", port: 80 });
  socket.once("connect", () => {
    socket.destroy();
    fail(new Error("External network allowed"));
  });
  socket.once("error", (error: NodeJS.ErrnoException) => done(error.code ?? "unknown"));
  socket.setTimeout(3000, () => {
    socket.destroy();
    fail(new Error("Network denial unproven"));
  });
});
assert.equal(denial, "EPERM");
const inventory = JSON.parse(
  await readFile(new URL("../governance/publishing/0.2.0.json", import.meta.url), "utf8"),
) as ReleaseInventory;
const archives = await verifyRetained(directory, inventory);
const stored = new Map<string, Buffer>();
const lag = new Map<string, number>();
let sends = 0;
let origin = "";
const failures: string[] = [];
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  const entry = archives.find(
    (entry) =>
      path === `/${entry.name}/${entry.version}` ||
      path === `/${entry.name}` ||
      path === `/archive/${entry.archive}`,
  );
  if (!entry) {
    response.writeHead(404).end();
    return;
  }
  if (request.method === "GET") {
    const bytes = stored.get(entry.name);
    if (!bytes) {
      response.writeHead(404).end();
      return;
    }
    if (path.startsWith("/archive/")) {
      response.writeHead(200).end(bytes);
      return;
    }
    if ((lag.get(entry.name) ?? 0) > 0) {
      lag.set(entry.name, lag.get(entry.name)! - 1);
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        name: entry.name,
        version: entry.version,
        dist: { tarball: `${origin}/archive/${entry.archive}` },
      }),
    );
    return;
  }
  if (request.method !== "PUT" || stored.has(entry.name)) {
    response.writeHead(409).end();
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  request.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > 24 * 1024 * 1024) request.destroy();
    else chunks.push(chunk);
  });
  request.on("end", () => {
    try {
      assert.equal(request.headers.authorization, "Bearer dummy-loopback-only");
      const body = JSON.parse(Buffer.concat(chunks).toString());
      assert.equal(body.name, entry.name);
      assert.equal(body.versions[entry.version].version, entry.version);
      assert.equal(Object.keys(body._attachments).length, 1);
      const attachment = Object.values(body._attachments)[0] as { data: string };
      const bytes = Buffer.from(attachment.data, "base64");
      assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
      assert.equal(bytes.length, entry.size);
      stored.set(entry.name, bytes);
      lag.set(entry.name, 1);
      sends++;
      response.writeHead(201, { "content-type": "application/json" }).end('{"ok":true}');
    } catch (error) {
      failures.push(String(error));
      response.writeHead(400).end();
    }
  });
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
assert(address && typeof address !== "string");
origin = `http://127.0.0.1:${address.port}`;
try {
  const port = createNpmPort({
    registry: new URL(origin + "/"),
    npmPath: "npm",
    token: "dummy-loopback-only",
    dryRun: false,
    provenance: false,
    env: { PATH: process.env.PATH },
  });
  const send = port.send;
  port.send = async (entry) => {
    await send(entry);
    if (sends === 2) {
      lag.set(entry.name, 0);
      throw new Error("Simulated uncertain acknowledgement");
    }
  };
  await assert.rejects(
    releaseArchives(archives, port, { attempts: 3, pause: async () => {} }),
    /uncertain/,
  );
  assert.equal(sends, 2);
  const resumed = await releaseArchives(archives, port, { attempts: 3, pause: async () => {} });
  assert.deepEqual(
    resumed.map((entry) => entry.state),
    ["already_verified", "already_verified", "verified"],
  );
  assert.equal(sends, 3);
  stored.set(archives[2]!.name, Buffer.from("conflict"));
  await assert.rejects(releaseArchives(archives, port), /Conflicting/);
  assert.equal(sends, 3);
  assert.deepEqual(failures, []);
  await verifyRetained(directory, inventory);
  const receipt = {
    mode: "loopback-retained-npm-publisher",
    publication: "disabled",
    candidateSource: inventory.sourceCommit,
    network: { external: denial, loopback: "real npm PUT and GET succeeded" },
    sends,
    resumed,
    conflict: "blocked before writes",
    delayedReadback: "passed",
    archiveHashesUnchanged: true,
  };
  await writeFile(output, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await new Promise<void>((done) => server.close(() => done()));
}
