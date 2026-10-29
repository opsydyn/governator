/* oxlint-disable linteffect/no-return-in-arrow */
import { expect, test } from "vitest";
import { sealedFixturePort, sealedNpmPort } from "../scripts/sealed-production-port.ts";

const base = {
  registry: new URL("https://registry.npmjs.org/"),
  token: "test-token",
  expectedCommit: "a".repeat(40),
  npm: "/usr/bin/npm",
  node: "/usr/bin/node",
  bridge: "/tmp/bridge.py",
  provenance: {
    ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.actions.githubusercontent.com/oidc",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "dummy",
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "opsydyn/governator",
    GITHUB_SHA: "a".repeat(40),
    GITHUB_REF: "refs/heads/main",
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_WORKFLOW_REF: "opsydyn/governator/.github/workflows/release.yml@refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY_ID: "12",
    GITHUB_REPOSITORY_OWNER_ID: "34",
    RUNNER_ENVIRONMENT: "github-hosted",
  },
  confirmedAbsent: [] as string[],
};

test("does not infer absence from a registry 404 without explicit per-package confirmation", async () => {
  const port = sealedNpmPort({ ...base, fetcher: async () => new Response(null, { status: 404 }) });
  await expect(port.read("@opsydyn/governator-cli", "0.1.0")).rejects.toThrow(/absence/i);
  const confirmed = sealedNpmPort({
    ...base,
    confirmedAbsent: ["@opsydyn/governator-cli"],
    fetcher: async () => new Response(null, { status: 404 }),
  });
  await expect(confirmed.read("@opsydyn/governator-cli", "0.1.0")).resolves.toEqual({
    status: "absent",
  });
});

test("authenticates registry reads and rejects cross-origin archive destinations", async () => {
  let authorization: string | null = null;
  const port = sealedNpmPort({
    ...base,
    fetcher: async (_url, init) => {
      authorization = new Headers(init?.headers).get("authorization");
      return Response.json({
        name: "@opsydyn/governator-cli",
        version: "0.1.0",
        dist: { tarball: "https://evil.invalid/a.tgz" },
      });
    },
  });
  await expect(port.read("@opsydyn/governator-cli", "0.1.0")).rejects.toThrow();
  expect(authorization).toBe("Bearer test-token");
});

test("snapshots the operator's absence confirmation at construction", async () => {
  const confirmedAbsent: string[] = [];
  const port = sealedNpmPort({
    ...base,
    confirmedAbsent,
    fetcher: async () => new Response(null, { status: 404 }),
  });
  confirmedAbsent.push("@opsydyn/governator-cli");
  await expect(port.read("@opsydyn/governator-cli", "0.1.0")).rejects.toThrow(/absence/i);
});

test("rejects incomplete or mismatched GitHub provenance before touching npm", () => {
  expect(() =>
    sealedNpmPort({
      ...base,
      provenance: {
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.actions.githubusercontent.com/oidc",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "dummy",
      },
    }),
  ).toThrow(/provenance/i);
});

test("binds production provenance to the approved source commit", () => {
  expect(() => sealedNpmPort({ ...base, expectedCommit: "b".repeat(40) })).toThrow(
    /source|provenance/i,
  );
});

test("fixture mode accepts only literal loopback with dummy credentials", async () => {
  const settings = {
    registry: new URL("http://127.0.0.1:12345/"),
    npm: "/usr/bin/npm",
    node: "/usr/bin/node",
    bridge: "/tmp/bridge.py",
    fetcher: async () => new Response(null, { status: 404 }),
  };
  await expect(
    sealedFixturePort(settings).read("@opsydyn/governator-cli", "0.1.0"),
  ).resolves.toEqual({ status: "absent" });
  expect(() =>
    sealedFixturePort({ ...settings, registry: new URL("https://registry.npmjs.org/") }),
  ).toThrow(/loopback/i);
});
