import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { tagEditor } from "../packages/storybook-addon/src/tag-editor-server.ts";
import { afterEach, expect, test } from "vitest";
import { evaluate } from "../packages/core/src/index.ts";
import { evaluation, at } from "./fixtures.ts";
import {
  decodeReport,
  verifyReportSource,
  loadReport,
} from "../packages/storybook-addon/src/report.ts";
import { registryMatchesReport } from "../packages/storybook-addon/src/registry-source.ts";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function git(root: string, args: string[]) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  }).trim();
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "governator-source-"));
  roots.push(root);
  await mkdir(join(root, "governance"));
  await writeFile(join(root, "governance/components.yaml"), "schemaVersion: 1\ncomponents: []\n");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["config", "user.email", "fixture@example.test"]);
  git(root, ["add", "governance/components.yaml"]);
  git(root, ["commit", "-qm", "fixture"]);
  return { root, path: "governance/components.yaml", commit: git(root, ["rev-parse", "HEAD"]) };
}
test("only reports matching HEAD, tracked index and working-tree registry are source-consistent", async () => {
  const item = await fixture();
  expect(await registryMatchesReport(item.root, item.path, item.commit)).toBe(true);
  expect(await registryMatchesReport(item.root, item.path, "0".repeat(40))).toBe(false);
  await writeFile(join(item.root, item.path), "schemaVersion: 1\ncomponents: [changed]\n");
  expect(await registryMatchesReport(item.root, item.path, item.commit)).toBe(false);
  git(item.root, ["add", item.path]);
  await writeFile(join(item.root, item.path), "schemaVersion: 1\ncomponents: []\n");
  expect(await registryMatchesReport(item.root, item.path, item.commit)).toBe(false);
});

test("the configured local source endpoint verifies a report commit", async () => {
  const item = await fixture();
  let handler: ((req: any, res: any, next: () => void) => void) | undefined;
  const server = {
    config: { root: item.root },
    middlewares: {
      use: (path: string, fn: typeof handler) => {
        if (path === "/__governator/registry-source") handler = fn;
      },
    },
  };
  tagEditor({ registry: { root: item.root, path: item.path } }).configureServer(server);
  expect(handler).toBeDefined();
  const req = Object.assign(Readable.from([]), {
    method: "GET",
    url: `/?commit=${item.commit}`,
    headers: { host: "127.0.0.1:6006" },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const result = await new Promise<{ status: number; body: string }>((resolve) => {
    let status = 0;
    handler!(
      req,
      {
        writeHead: (value: number) => {
          status = value;
        },
        end: (body: string) => resolve({ status, body }),
      },
      () => {},
    );
  });
  expect(result.status).toBe(200);
  expect(JSON.parse(result.body)).toEqual({ matches: true });
});

test("a source mismatch or unavailable local adapter makes a report unverified", async () => {
  const state = decodeReport(evaluate(evaluation()), Date.parse(at));
  expect(
    (
      await verifyReportSource(
        state,
        "http://localhost:6006/",
        async () => new Response(JSON.stringify({ matches: false })),
      )
    ).status,
  ).toBe("error");
  expect(
    await verifyReportSource(
      state,
      "http://localhost:6006/",
      async () => new Response("", { status: 404 }),
    ),
  ).toMatchObject({ status: "error" });
  expect(
    await verifyReportSource(
      state,
      "http://localhost:6006/",
      async () => new Response(JSON.stringify({ matches: true })),
    ),
  ).toMatchObject({ status: "ready", source: "local-match" });
});

test("loading a configured report refuses a mismatched local registry", async () => {
  const state = await loadReport(
    "/report.json",
    "http://localhost:6006/",
    Date.parse(at),
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("registry-source") ? { matches: false } : evaluate(evaluation()),
        ),
      ),
    undefined,
    true,
  );
  expect(state.status).toBe("error");
});

test("an active local verifier cannot be bypassed by a story disabling the editor", async () => {
  const state = await loadReport(
    "/report.json",
    "http://localhost:6006/",
    Date.parse(at),
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("registry-source") ? { matches: false } : evaluate(evaluation()),
        ),
      ),
  );
  expect(state.status).toBe("error");
});
