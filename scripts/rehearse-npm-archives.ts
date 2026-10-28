/* Local-only npm fake-registry rehearsal; npm is confined to loopback by macOS sandbox-exec. */
/* oxlint-disable linteffect/no-return-in-arrow, linteffect/no-try-catch, linteffect/no-string-sentinel-const, linteffect/no-process-env-direct-read, linteffect/no-naked-object-state-update, linteffect/no-boundary-try-catch-without-effect-map */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { ensure } from "@governator/core";
import { cleanHead } from "../packages/cli/src/source.ts";
import {
  candidateDigest,
  createCandidate,
  rehearseCandidate,
  verifyNpmFixtureUpload,
} from "../packages/cli/src/first-release-rehearsal.ts";
import type { Candidate } from "../packages/cli/src/first-release-rehearsal.ts";
import {
  assertEmptyFirstReleaseQueue,
  loadArchives,
  readRegular,
} from "./rehearse-single-maintainer.ts";

const profile =
  '(version 1)(allow default)(deny network*)(allow network-outbound (remote ip "localhost:*"))(allow network-bind (local ip "localhost:*"))(allow network-inbound (local ip "localhost:*"))';
async function main() {
  const [directory, reviewedDigest] = process.argv.slice(2);
  ensure(
    process.platform === "darwin",
    "npm fixture requires macOS sandbox-exec; no unconfined fallback",
  );
  ensure(
    isAbsolute(directory ?? "") &&
      typeof reviewedDigest === "string" &&
      /^[a-f0-9]{64}$/.test(reviewedDigest),
    "Provide absolute archive directory and reviewed candidate digest",
  );
  const commit = cleanHead(process.cwd());
  const candidate: unknown = JSON.parse(
    new TextDecoder().decode(await readRegular(join(directory!, "candidate.json"))),
  );
  await assertEmptyFirstReleaseQueue(process.cwd());
  const archives = await loadArchives(directory!);
  // Schema validation and complete input verification happen before the server starts.
  await rehearseCandidate(candidate, reviewedDigest, commit, archives);
  const validated = createCandidate(commit, archives);
  ensure(candidateDigest(validated) === reviewedDigest, "Candidate mismatch");
  const received: ReturnType<typeof verifyNpmFixtureUpload>[] = [];
  let expected: Candidate["packages"][number] | undefined;
  const server = createServer((request, response) => {
    if (request.method === "GET") {
      response.writeHead(404);
      response.end();
      return;
    }
    if (request.method !== "PUT" || !expected) {
      response.writeHead(405);
      response.end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (part: Buffer) => {
      size += part.length;
      if (size > 24 * 1024 * 1024) request.destroy();
      else chunks.push(part);
    });
    request.on("end", () => {
      try {
        ensure(
          decodeURIComponent((request.url ?? "").split("?", 1)[0]!.slice(1)) === expected!.name,
          "Fixture path mismatch",
        );
        const receipt = verifyNpmFixtureUpload(
          expected!,
          JSON.parse(Buffer.concat(chunks).toString("utf8")),
        );
        received.push(receipt);
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      } catch {
        response.writeHead(400);
        response.end();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  ensure(address !== null && typeof address !== "string", "Unable to start loopback fixture");
  const registry = `http://127.0.0.1:${address.port}/`;
  const home = await mkdtemp(join(tmpdir(), "governator-npm-fixture-"));
  const config = join(home, ".npmrc");
  const global = join(home, "empty-global-npmrc");
  await writeFile(config, `//127.0.0.1:${address.port}/:_authToken=dummy-fixture-token\n`);
  await writeFile(global, "");
  try {
    const probe = `import net from "node:net";
const local = Number(process.argv[1]);
await new Promise((yes,no)=>{const s=net.connect({host:"127.0.0.1",port:local},()=>{s.end();yes();});s.on("error",no);s.setTimeout(5000,()=>{s.destroy();no(Error("loopback timeout"));});});
const code=await new Promise((yes,no)=>{const s=net.connect({host:"192.0.2.1",port:80},()=>{s.destroy();no(Error("external network allowed"));});s.on("error",e=>yes(e.code));s.setTimeout(5000,()=>{s.destroy();no(Error("external denial not proven"));});});
if(code!=="EPERM") throw Error("external denial not proven: "+code);`;
    const probeExit = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(
        "/usr/bin/sandbox-exec",
        ["-p", profile, "node", "--input-type=module", "-e", probe, String(address.port)],
        {
          cwd: home,
          env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: home, TMPDIR: home },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      child.stdout.resume();
      child.stderr.resume();
      child.once("error", reject);
      child.once("close", resolve);
    });
    ensure(probeExit === 0, "Network sandbox probes failed; refusing to run npm");
    for (const item of validated.packages) {
      expected = item;
      const basename = item.name.slice("@governator/".length);
      const path = join(directory!, `governator-${basename}-0.1.0.tgz`);
      const args = [
        "-p",
        profile,
        "npm",
        "publish",
        path,
        "--registry",
        registry,
        "--ignore-scripts",
        "--provenance=false",
        "--access=public",
      ];
      const exit = await new Promise<number | null>((resolve, reject) => {
        const child = spawn("/usr/bin/sandbox-exec", args, {
          cwd: home,
          env: {
            PATH: process.env.PATH ?? "/usr/bin:/bin",
            HOME: home,
            TMPDIR: home,
            CI: "1",
            npm_config_userconfig: config,
            npm_config_globalconfig: global,
            npm_config_cache: join(home, "cache"),
            npm_config_registry: registry,
            npm_config_update_notifier: "false",
            npm_config_fetch_retries: "0",
            npm_config_provenance: "false",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.stdout.resume();
        child.stderr.resume();
        child.once("error", reject);
        child.once("close", resolve);
      });
      ensure(
        exit === 0 && received.length === validated.packages.indexOf(item) + 1,
        `Fixture npm transfer failed for ${item.name}`,
      );
    }
    ensure(cleanHead(process.cwd()) === commit, "Source changed during npm fixture");
    const result = {
      mode: "loopback-npm-fixture",
      publishable: false,
      sourceCommit: commit,
      reviewedDigest,
      npmRegistry: "loopback-fake",
      receipts: received,
    };
    await writeFile(
      join(directory!, "npm-rehearsal.json"),
      JSON.stringify(result, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
if (import.meta.main) await main();
