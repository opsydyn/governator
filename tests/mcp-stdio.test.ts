import { afterEach, expect, test } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createSnapshot } from "../packages/query/src/index.ts";
import { queryProject } from "./query-fixtures.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(reportVersion: 1 | 2 = 1) {
  const f = await queryProject(undefined, reportVersion);
  roots.push(f.root);
  await writeFile(
    join(f.root, "artifacts/snapshot.json"),
    JSON.stringify(await createSnapshot(f.root, { report: "artifacts/report.json" })),
  );
  return f;
}
const entry = resolve("packages/mcp/src/main.ts");
test.each([1, 2] as const)(
  "Bun stdio SDK handles schema %i, parallel queries, cancellation and orderly close",
  async (version) => {
    const f = await fixture(version);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry, "--root", f.root, "--snapshot", "artifacts/snapshot.json"],
      stderr: "pipe",
      // The SDK only inherits a small environment allowlist; preserve CI's
      // explicit Git isolation without exposing unrelated credentials.
      env: {
        ...(process.env.GIT_CONFIG_GLOBAL
          ? { GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL }
          : {}),
        ...(process.env.GIT_CONFIG_NOSYSTEM
          ? { GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM }
          : {}),
      },
    });
    let diagnostics = "";
    transport.stderr?.on("data", (chunk) => {
      diagnostics += chunk;
    });
    const client = new Client({ name: "governator-stdio-test", version: "0.1.0" });
    const errors: Error[] = [];
    client.onerror = (error) => errors.push(error);
    let pid: number | null = null;
    try {
      await client.connect(transport);
      pid = transport.pid;
      expect((await client.listTools()).tools).toHaveLength(15);
      const responses = await Promise.all(
        Array.from({ length: 8 }, () =>
          client.callTool({ name: "get_design_system_report", arguments: {} }),
        ),
      );
      for (const response of responses)
        expect(response.structuredContent).toMatchObject({
          sourceCommit: f.commit,
          data: f.report,
        });
      const controller = new AbortController();
      controller.abort();
      await expect(
        client.callTool({ name: "list_components", arguments: {} }, { signal: controller.signal }),
      ).rejects.toThrow();
      expect((await client.callTool({ name: "list_components", arguments: {} })).isError).not.toBe(
        true,
      );
      await writeFile(join(f.root, "artifacts/report.json"), "changed after startup");
      expect(
        (await client.callTool({ name: "get_design_system_report", arguments: {} }))
          .structuredContent,
      ).toMatchObject({ data: f.report });
    } finally {
      await client.close();
    }
    expect(diagnostics).toBe("");
    expect(errors).toEqual([]);
    expect(pid).not.toBeNull();
    expect(() => process.kill(pid!, 0)).toThrow();
  },
  15000,
);
async function line(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  state: { pending: string },
): Promise<Record<string, unknown>> {
  for (;;) {
    const i = state.pending.indexOf("\n");
    if (i >= 0) {
      const value = JSON.parse(state.pending.slice(0, i));
      state.pending = state.pending.slice(i + 1);
      return value;
    }
    const next = await reader.read();
    if (next.done) throw new Error("early EOF");
    state.pending += new TextDecoder().decode(next.value, { stream: true });
  }
}

test("stdout framing is JSON-RPC only and EOF exits without signals", async () => {
  const f = await fixture();
  const child = Bun.spawn(
    [process.execPath, entry, "--root", f.root, "--snapshot", "artifacts/snapshot.json"],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  const reader = child.stdout.getReader(),
    state = { pending: "" };
  try {
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "framing", version: "1" },
        },
      }) + "\n",
    );
    expect(await line(reader, state)).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "governator" } },
    });
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) +
        "\n" +
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) +
        "\n",
    );
    expect(await line(reader, state)).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: { tools: expect.any(Array) },
    });
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_design_system_report", arguments: {} },
      }) + "\n",
    );
    expect(await line(reader, state)).toMatchObject({
      jsonrpc: "2.0",
      id: 3,
      result: { structuredContent: { sourceCommit: f.commit, data: f.report } },
    });
    child.stdin.end();
    expect(await child.exited).toBe(0);
    expect(await new Response(child.stderr).text()).toBe("");
  } finally {
    child.kill();
    reader.releaseLock();
  }
}, 10000);
test("startup rejects mismatched snapshots and missing arguments using stderr only", async () => {
  const f = await fixture();
  await writeFile(join(f.root, "artifacts/report.json"), "changed");
  for (const args of [[], ["--root", f.root, "--snapshot", "artifacts/snapshot.json"]]) {
    const child = Bun.spawn([process.execPath, entry, ...args], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("startup failed");
  }
});

test("EOF drains requests already received before closing stdout", async () => {
  const f = await fixture();
  const child = Bun.spawn(
    [process.execPath, entry, "--root", f.root, "--snapshot", "artifacts/snapshot.json"],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  child.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "eof", version: "1" },
      },
    }) + "\n",
  );
  child.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code).toBe(0);
  expect(JSON.parse(stdout)).toMatchObject({
    id: 1,
    result: { serverInfo: { name: "governator" } },
  });
  expect(stderr).toBe("");
}, 10000);

test("stdio rejects an incomplete frame larger than 16 KiB", async () => {
  const f = await fixture();
  const child = Bun.spawn(
    [process.execPath, entry, "--root", f.root, "--snapshot", "artifacts/snapshot.json"],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  child.stdin.write("x".repeat(16385));
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code).toBe(2);
  expect(stdout).toBe("");
  expect(stderr).toContain("transport error");
}, 10000);

test("stdio supports stateless MCP 2026 discovery", async () => {
  const f = await fixture();
  const child = Bun.spawn(
    [process.execPath, entry, "--root", f.root, "--snapshot", "artifacts/snapshot.json"],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  child.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }) + "\n",
  );
  child.stdin.end();
  const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  expect(code).toBe(0);
  expect(JSON.parse(stdout)).toMatchObject({ id: 1, result: { tools: expect.any(Array) } });
}, 10000);
