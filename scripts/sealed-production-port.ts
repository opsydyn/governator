/* Unwired live-capable transport. Requires a reviewed runner, sealed bridge and explicit release authorization. */
/* oxlint-disable linteffect/no-if-statement, linteffect/no-return-in-arrow, linteffect/no-try-catch, linteffect/no-string-sentinel-const, linteffect/no-process-env-direct-read, linteffect/no-naked-object-state-update, linteffect/no-boundary-try-catch-without-effect-map -- OS process-group cleanup at the subprocess boundary. */
import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { ensure } from "@governator/core";
import type { RegistryPort } from "../packages/cli/src/single-maintainer-adapter.ts";
import { inspectArchiveForRehearsal } from "./rehearse-single-maintainer.ts";
import { readNpmVersion } from "./npm-transport.ts";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export function sealedNpmPort(options: {
  registry: URL;
  expectedCommit: string;
  token: string;
  npm: string;
  node: string;
  bridge: string;
  provenance: Readonly<Record<string, string>>;
  confirmedAbsent: readonly string[];
  fetcher?: Fetcher;
}): RegistryPort {
  ensure(
    options.registry.href === "https://registry.npmjs.org/",
    "Only the official npm registry is supported",
  );
  ensure(/^[\x21-\x7e]{1,4096}$/.test(options.token), "Invalid npm token");
  ensure(
    [options.npm, options.node, options.bridge].every(isAbsolute),
    "Absolute executable paths required",
  );
  const provenance = { ...options.provenance };
  const keys = [
    "ACTIONS_ID_TOKEN_REQUEST_URL",
    "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
    "GITHUB_ACTIONS",
    "GITHUB_REPOSITORY",
    "GITHUB_SHA",
    "GITHUB_REF",
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT",
    "GITHUB_SERVER_URL",
    "GITHUB_WORKFLOW_REF",
    "GITHUB_EVENT_NAME",
    "GITHUB_REPOSITORY_ID",
    "GITHUB_REPOSITORY_OWNER_ID",
    "RUNNER_ENVIRONMENT",
  ];
  ensure(
    Object.keys(provenance).length === keys.length &&
      keys.every((key) => typeof provenance[key] === "string" && provenance[key]!.length > 0),
    "Complete provenance context required",
  );
  const oidc = new URL(provenance.ACTIONS_ID_TOKEN_REQUEST_URL!);
  ensure(
    oidc.protocol === "https:" &&
      oidc.hostname.endsWith(".actions.githubusercontent.com") &&
      !oidc.username &&
      !oidc.password,
    "Untrusted provenance endpoint",
  );
  ensure(
    provenance.GITHUB_ACTIONS === "true" &&
      provenance.GITHUB_REPOSITORY === "opsydyn/governator" &&
      provenance.GITHUB_SERVER_URL === "https://github.com" &&
      provenance.GITHUB_REF === "refs/heads/main" &&
      provenance.GITHUB_EVENT_NAME === "workflow_dispatch" &&
      provenance.RUNNER_ENVIRONMENT === "github-hosted",
    "Unexpected provenance identity",
  );
  ensure(
    /^[a-f0-9]{40}$/.test(provenance.GITHUB_SHA!) &&
      [
        "GITHUB_RUN_ID",
        "GITHUB_RUN_ATTEMPT",
        "GITHUB_REPOSITORY_ID",
        "GITHUB_REPOSITORY_OWNER_ID",
      ].every((key) => /^[1-9][0-9]{0,19}$/.test(provenance[key]!)),
    "Invalid provenance identity",
  );
  ensure(
    provenance.GITHUB_WORKFLOW_REF ===
      "opsydyn/governator/.github/workflows/release.yml@refs/heads/main",
    "Unexpected provenance workflow",
  );
  ensure(provenance.GITHUB_SHA === options.expectedCommit, "Provenance source commit mismatch");
  return createTransport(options, false, provenance);
}

export function sealedFixturePort(options: {
  registry: URL;
  npm: string;
  node: string;
  bridge: string;
  fetcher?: Fetcher;
}): RegistryPort {
  const url = options.registry;
  ensure(
    url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      Boolean(url.port) &&
      url.pathname === "/" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash,
    "Fixture registry must be literal loopback",
  );
  return createTransport(
    {
      ...options,
      token: "dummy-fixture-token",
      confirmedAbsent: [
        "@opsydyn/governator-cli",
        "@opsydyn/governator-mcp",
        "@opsydyn/storybook-addon-governator",
      ],
    },
    true,
    {},
  );
}

function createTransport(
  options: {
    registry: URL;
    token: string;
    npm: string;
    node: string;
    bridge: string;
    confirmedAbsent: readonly string[];
    fetcher?: Fetcher;
  },
  fixture: boolean,
  provenance: Readonly<Record<string, string>>,
): RegistryPort {
  ensure(
    [options.npm, options.node, options.bridge].every(isAbsolute),
    "Absolute executable paths required",
  );
  const names = new Set([
    "@opsydyn/governator-cli",
    "@opsydyn/governator-mcp",
    "@opsydyn/storybook-addon-governator",
  ]);
  ensure(
    options.confirmedAbsent.every((name) => names.has(name)) &&
      new Set(options.confirmedAbsent).size === options.confirmedAbsent.length,
    "Invalid absence confirmation",
  );
  const confirmedAbsent = new Set(options.confirmedAbsent);
  const { npm, node, bridge } = options;
  const registry = new URL(options.registry.href);
  const token = options.token;
  const fetcher = options.fetcher ?? fetch;
  const authorizedFetch: Fetcher = (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input));
    ensure(
      target.origin === registry.origin && !target.username && !target.password,
      "Untrusted registry request",
    );
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetcher(target, { ...init, headers, redirect: "error" });
  };
  return {
    async read(name, version) {
      const result = await readNpmVersion(registry, name, version, authorizedFetch);
      if (result.status === "absent")
        ensure(confirmedAbsent.has(name), "Registry absence requires explicit confirmation");
      return result;
    },
    async send(name, version, bytes) {
      ensure(names.has(name) && version === "0.1.0", "Unexpected package identity");
      ensure(
        process.platform === "linux" && process.getuid?.() === 0,
        "Sealed npm requires Linux root controller",
      );
      ensure(bytes.byteLength > 0 && bytes.byteLength <= 16 * 1024 * 1024, "Invalid archive size");
      const snapshot = Uint8Array.from(bytes);
      await inspectArchiveForRehearsal(snapshot, name);
      const sha256 = new Bun.CryptoHasher("sha256").update(snapshot).digest("hex");
      const request = JSON.stringify({
        name,
        version,
        sha256,
        archive: Buffer.from(snapshot).toString("base64"),
        registry: registry.href,
        token,
        fixture,
        npm,
        node,
        provenance,
      });
      await new Promise<void>((resolve, reject) => {
        const child = spawn("/usr/bin/python3", [bridge], {
          env: { PATH: "/usr/bin:/bin", GOVERNATOR_PARENT_PID: String(process.pid) },
          detached: true,
          stdio: ["pipe", "ignore", "ignore"],
        });
        const timer = setTimeout(() => {
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              /* Already exited. */
            }
          }
        }, 150000);
        child.stdin.once("error", () => {});
        child.once("error", () => {
          clearTimeout(timer);
          reject(new Error("Sealed npm bridge failed; outcome unknown"));
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error("Sealed npm bridge failed; outcome unknown"));
        });
        child.stdin.end(request);
      });
    },
  };
}
