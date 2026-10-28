/* eslint-disable linteffect/no-naked-object-state-update, linteffect/no-return-in-arrow, linteffect/no-string-sentinel-const -- Disposable protocol and subprocess fixture; no shipped domain state or release authorization. */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = mkdtempSync("/private/tmp/governator-custody-fixture-");
const bin = "bun";
const changesets = join(
  dirname(fileURLToPath(import.meta.url)),
  "../node_modules/@changesets/cli/bin.js",
);
const events = [];
const submissions = [];
const server = createServer((req, res) => {
  let chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    events.push({ method: req.method, url: req.url });
    if (req.method === "GET") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    if (req.method === "PUT") {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const attachments = Object.values(body._attachments ?? {});
      if (attachments.length !== 1) {
        res.writeHead(400);
        res.end();
        return;
      }
      submissions.push({
        name: body.name,
        versions: Object.keys(body.versions ?? {}),
        bytes: Buffer.from(attachments[0].data, "base64"),
      });
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(405);
    res.end();
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
server.unref();
const registry = `http://127.0.0.1:${server.address().port}/`;
const profile =
  '(version 1)(allow default)(deny network*)(allow network-outbound (remote ip "localhost:*"))(allow network-bind (local ip "localhost:*"))(allow network-inbound (local ip "localhost:*"))';
const env = {
  PATH: process.env.PATH,
  HOME: root,
  TMPDIR: root,
  CI: "1",
  npm_config_userconfig: join(root, ".npmrc"),
  npm_config_globalconfig: join(root, "empty-global-npmrc"),
  npm_config_cache: join(root, "cache"),
  npm_config_registry: registry,
  npm_config_update_notifier: "false",
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_fetch_retries: "0",
  npm_config_provenance: "false",
  PACK_VALUE: "approved",
};
writeFileSync(
  join(root, ".npmrc"),
  `//127.0.0.1:${server.address().port}/:_authToken=dummy-fixture-token\n`,
);
writeFileSync(join(root, "empty-global-npmrc"), "");
mkdirSync(join(root, ".changeset"));
writeFileSync(
  join(root, ".changeset/config.json"),
  JSON.stringify({
    changelog: "@changesets/cli/changelog",
    commit: false,
    fixed: [],
    linked: [],
    access: "public",
    baseBranch: "main",
    updateInternalDependencies: "patch",
    ignore: [],
  }),
);
writeFileSync(
  join(root, "package.json"),
  JSON.stringify({
    name: "@fixture/custody-rehearsal",
    version: "0.1.0",
    type: "module",
    files: ["index.js"],
    scripts: { prepack: "node prepack.cjs" },
    publishConfig: { access: "public" },
  }),
);
writeFileSync(
  join(root, "prepack.cjs"),
  "require('node:fs').writeFileSync('index.js', 'export default '+JSON.stringify(process.env.PACK_VALUE)+';\\n');\n",
);
writeFileSync(join(root, "index.js"), 'export default "initial";\n');
writeFileSync(join(root, ".gitignore"), "cache/\n*.tgz\n.npmrc\n");
function git(...args) {
  const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: root,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
    },
  });
  if (r.status !== 0) throw Error(r.stderr);
}
git("init", "-q");
git("add", ".");
git(
  "-c",
  "user.name=Fixture",
  "-c",
  "user.email=fixture@example.invalid",
  "commit",
  "-qm",
  "fixture",
);
function run(command, args, overrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/sandbox-exec", ["-p", profile, command, ...args], {
      cwd: root,
      env: { ...env, ...overrides },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (x) => (stdout += x));
    child.stderr.on("data", (x) => (stderr += x));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
const approved = await run("npm", ["pack", "--pack-destination", root, "--json"]);
if (approved.code !== 0) throw Error(`pack: ${approved.stderr}`);
const packed = JSON.parse(approved.stdout);
const approvedBytes = readFileSync(join(root, packed[0].filename));
const publish = await run(bin, [changesets, "publish"], { PACK_VALUE: "mutated-before-publish" });
if (publish.code !== 0 || submissions.length !== 1)
  throw Error(
    `publish ${publish.code}: ${publish.stdout} ${publish.stderr}; ${submissions.length} uploads`,
  );
const uploaded = submissions[0];
// The fixture registry permits the duplicate version for this isolated second experiment.
const direct = await run(
  "npm",
  ["publish", join(root, packed[0].filename), "--access", "public", "--json"],
  { PACK_VALUE: "mutated-before-publish" },
);
await new Promise((resolve) => server.close(resolve));
if (direct.code !== 0 || submissions.length !== 2)
  throw Error(`Direct tarball publish failed: ${direct.stderr}`);
const directUpload = submissions[1];
if (
  uploaded.name !== "@fixture/custody-rehearsal" ||
  JSON.stringify(uploaded.versions) !== '["0.1.0"]'
)
  throw Error("Unexpected fake-registry package identity");
const hash = (b) => createHash("sha256").update(b).digest("hex");
// This is a fixture-only comparison model, not an authorization or publisher.
function matches(expected, actual) {
  if (expected.commit !== actual.commit || expected.packages.length !== actual.packages.length)
    return false;
  const unique = (packages) => new Set(packages.map((item) => item.name)).size === packages.length;
  if (!unique(expected.packages) || !unique(actual.packages)) return false;
  return expected.packages.every((item) =>
    actual.packages.some(
      (other) =>
        item.name === other.name && item.version === other.version && item.sha256 === other.sha256,
    ),
  );
}
const expected = {
  commit: "fixture-source-a",
  packages: [{ name: "@fixture/custody-rehearsal", version: "0.1.0", sha256: hash(approvedBytes) }],
};
const cases = {
  matching: expected,
  changedBytes: {
    ...expected,
    packages: [{ ...expected.packages[0], sha256: hash(uploaded.bytes) }],
  },
  wrongName: { ...expected, packages: [{ ...expected.packages[0], name: "@fixture/other" }] },
  wrongVersion: { ...expected, packages: [{ ...expected.packages[0], version: "0.1.1" }] },
  wrongCommit: { ...expected, commit: "fixture-source-b" },
  missing: { ...expected, packages: [] },
  extraDuplicate: { ...expected, packages: [...expected.packages, expected.packages[0]] },
};
const model = Object.fromEntries(
  Object.entries(cases).map(([name, actual]) => [name, matches(expected, actual)]),
);
if (
  !model.matching ||
  Object.entries(model).some(([name, result]) => name !== "matching" && result)
)
  throw Error("Fixture comparison model accepted a mismatch");
const record = {
  root,
  registry,
  approved: { name: "@fixture/custody-rehearsal", version: "0.1.0", sha256: hash(approvedBytes) },
  observed: { name: uploaded.name, versions: uploaded.versions, sha256: hash(uploaded.bytes) },
  equal: hash(approvedBytes) === hash(uploaded.bytes),
  tarballPublish: {
    name: directUpload.name,
    versions: directUpload.versions,
    sha256: hash(directUpload.bytes),
    equal: hash(approvedBytes) === hash(directUpload.bytes),
  },
  events,
  model,
  publishOutput: publish.stdout,
};
if (record.equal) throw Error("Expected the prepack mutation to change the uploaded archive");
if (
  !record.tarballPublish.equal ||
  directUpload.name !== record.approved.name ||
  JSON.stringify(directUpload.versions) !== '["0.1.0"]'
)
  throw Error("Direct tarball publication did not preserve the approved archive");
writeFileSync(join(root, "observed.tgz"), uploaded.bytes);
writeFileSync(join(root, "result.json"), JSON.stringify(record, null, 2));
console.log(JSON.stringify(record, null, 2));
