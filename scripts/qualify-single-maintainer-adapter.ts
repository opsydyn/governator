/* Local-only fixture: no network, credentials, or npm publication. */
/* oxlint-disable linteffect/no-string-sentinel-const, linteffect/no-return-in-arrow, linteffect/no-throw-in-effect, linteffect/no-magic-domain-string, linteffect/no-naked-object-state-update, linteffect/no-if-statement */
import { writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { ensure } from "@governator/core";
import { cleanHead } from "../packages/cli/src/source.ts";
import { candidateDigest } from "../packages/cli/src/first-release-rehearsal.ts";
import { rehearseSingleMaintainer } from "../packages/cli/src/single-maintainer-adapter.ts";
import type { RegistryPort } from "../packages/cli/src/single-maintainer-adapter.ts";
import {
  assertEmptyFirstReleaseQueue,
  loadArchives,
  readRegular,
} from "./rehearse-single-maintainer.ts";

const [directory, digest] = process.argv.slice(2);
ensure(isAbsolute(directory ?? ""), "Provide an absolute archive directory");
ensure(typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest), "Provide the candidate digest");
const commit = cleanHead(process.cwd());
await assertEmptyFirstReleaseQueue(process.cwd());
const archives = await loadArchives(directory!);
const candidate = JSON.parse(
  new TextDecoder().decode(await readRegular(join(directory!, "candidate.json"))),
);
ensure(candidateDigest(candidate) === digest, "Candidate digest mismatch");
const values = new Map<string, Uint8Array>();
let sends = 0;
let interrupt = true;
const port: RegistryPort = {
  async read(name, version) {
    const bytes = values.get(`${name}@${version}`);
    return bytes ? { status: "present", bytes: Uint8Array.from(bytes) } : { status: "absent" };
  },
  async send(name, version, bytes) {
    sends++;
    values.set(`${name}@${version}`, Uint8Array.from(bytes));
    if (sends === 2 && interrupt) {
      interrupt = false;
      throw new Error("Simulated lost acknowledgement");
    }
  },
};
const first = await rehearseSingleMaintainer(candidate, digest!, commit, archives, port);
ensure(
  first.status === "stopped" &&
    first.packages.map((p) => p.status).join(",") === "verified,unknown,not_attempted",
  "Interrupted-transfer scenario failed",
);
const retry = await rehearseSingleMaintainer(candidate, digest!, commit, archives, port);
ensure(
  retry.status === "complete" &&
    retry.packages.map((p) => p.status).join(",") ===
      "already_verified,already_verified,verified" &&
    sends === 3,
  "Retry scenario failed",
);
const conflictValues = new Map(values);
conflictValues.set(`${archives[2]!.name}@${archives[2]!.version}`, new Uint8Array([1]));
let conflictSends = 0;
const conflictPort: RegistryPort = {
  async read(name, version) {
    const bytes = conflictValues.get(`${name}@${version}`);
    return bytes ? { status: "present", bytes } : { status: "absent" };
  },
  async send() {
    conflictSends++;
  },
};
const conflict = await rehearseSingleMaintainer(candidate, digest!, commit, archives, conflictPort);
ensure(
  conflict.status === "stopped" &&
    conflict.packages[2]!.status === "conflict" &&
    conflictSends === 0,
  "Conflict scenario failed",
);
ensure(cleanHead(process.cwd()) === commit, "Source changed during qualification");
const receipt = {
  mode: "in-memory-registry-qualification",
  publication: "disabled",
  sourceCommit: commit,
  reviewedDigest: digest,
  interrupted: first,
  retry,
  conflict,
};
await writeFile(
  join(directory!, "adapter-rehearsal.json"),
  JSON.stringify(receipt, null, 2) + "\n",
  { flag: "wx", mode: 0o600 },
);
console.log(JSON.stringify(receipt, null, 2));
