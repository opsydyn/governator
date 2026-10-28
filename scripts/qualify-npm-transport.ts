/* Execute only under a network-denying sandbox; dummy token and loopback registry only. */
/* oxlint-disable linteffect/no-string-sentinel-const, linteffect/no-return-in-arrow, linteffect/no-try-catch, linteffect/no-if-statement, linteffect/no-magic-domain-string, linteffect/no-process-env-direct-read, linteffect/no-boundary-try-catch-without-effect-map, linteffect/no-naked-object-state-update */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { ensure } from "@governator/core";
import { cleanHead } from "../packages/cli/src/source.ts";
import {
  candidateDigest,
  createCandidate,
  verifyNpmFixtureUpload,
} from "../packages/cli/src/first-release-rehearsal.ts";
import { rehearseSingleMaintainer } from "../packages/cli/src/single-maintainer-adapter.ts";
import {
  assertEmptyFirstReleaseQueue,
  loadArchives,
  readRegular,
} from "./rehearse-single-maintainer.ts";
import { npmTransport } from "./npm-transport.ts";

const [directory, digest, npmPath] = process.argv.slice(2);
ensure(
  process.platform === "darwin" &&
    isAbsolute(directory ?? "") &&
    isAbsolute(npmPath ?? "") &&
    typeof digest === "string" &&
    /^[0-9a-f]{64}$/.test(digest),
  "Expected macOS, absolute archive directory, digest and npm executable",
);
// A successful connection or a timeout does not prove network confinement.
const denied = await new Promise<number | null>((resolve, reject) => {
  const probe = `const net=require("node:net"); const s=net.connect({host:"192.0.2.1",port:80}); s.on("connect",()=>{s.destroy();process.exit(1)}); s.on("error",e=>process.exit(e.code === "EPERM" ? 0 : 1)); s.setTimeout(3000,()=>{s.destroy();process.exit(1)});`;
  const child = spawn("node", ["-e", probe], { stdio: "ignore" });
  child.once("error", reject);
  child.once("close", resolve);
});
ensure(denied === 0, "Network denial not proven");
const commit = cleanHead(process.cwd());
await assertEmptyFirstReleaseQueue(process.cwd());
const candidate = JSON.parse(
  new TextDecoder().decode(await readRegular(join(directory!, "candidate.json"))),
);
const archives = await loadArchives(directory!);
ensure(
  candidateDigest(candidate) === digest &&
    candidateDigest(createCandidate(commit, archives)) === digest,
  "Candidate mismatch",
);
const expected = createCandidate(commit, archives);
const received = new Map<string, Uint8Array>();
let sends = 0;
let base = "";
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  if (request.method === "GET") {
    for (const item of expected.packages) {
      if (path === `/${item.name}/${item.version}`) {
        if (!received.has(item.name)) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            name: item.name,
            version: item.version,
            dist: { tarball: `${base}archive/${encodeURIComponent(item.name)}` },
          }),
        );
        return;
      }
      if (path === `/archive/${item.name}` && received.has(item.name)) {
        response.writeHead(200).end(received.get(item.name));
        return;
      }
    }
    response.writeHead(404).end();
    return;
  }
  const item = expected.packages.find((entry) => path === `/${entry.name}`);
  if (request.method !== "PUT" || !item) {
    response.writeHead(405).end();
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
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      verifyNpmFixtureUpload(item, body);
      const data = Object.values(body._attachments)[0] as { data: string };
      received.set(item.name, Uint8Array.from(Buffer.from(data.data, "base64")));
      sends++;
      response
        .writeHead(201, { "content-type": "application/json" })
        .end(JSON.stringify({ ok: true }));
    } catch {
      response.writeHead(400).end();
    }
  });
});
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
ensure(address !== null && typeof address !== "string", "Fixture unavailable");
base = `http://127.0.0.1:${address.port}/`;
try {
  const port = npmTransport({
    registry: new URL(base),
    npmPath: npmPath!,
    token: "dummy-local-token",
    provenance: false,
    path: process.env.PATH ?? "/usr/bin:/bin",
  });
  const send = port.send;
  let lose = true;
  port.send = async (...args) => {
    await send(...args);
    if (lose) {
      lose = false;
      throw new Error("Simulated lost acknowledgement");
    }
  };
  const first = await rehearseSingleMaintainer(candidate, digest!, commit, archives, port);
  ensure(
    first.status === "stopped" && first.packages[0]?.status === "unknown",
    "Interrupted send was not uncertain",
  );
  const retry = await rehearseSingleMaintainer(candidate, digest!, commit, archives, port);
  ensure(
    retry.status === "complete" && retry.packages[0]?.status === "already_verified" && sends === 3,
    "Retry failed",
  );
  ensure(cleanHead(process.cwd()) === commit, "Source changed");
  const receipt = {
    mode: "sandboxed-loopback-npm-transport",
    publication: "disabled",
    sourceCommit: commit,
    digest,
    externalProbe: { destination: "192.0.2.1:80", result: "EPERM" },
    first,
    retry,
    sends,
  };
  await writeFile(
    join(directory!, "npm-transport-rehearsal.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
