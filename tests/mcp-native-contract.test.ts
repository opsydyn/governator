import { expect, test } from "vitest";
import manifest from "../packages/mcp/package.json";
import { createMcpServer } from "../packages/mcp/src/server.ts";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

test("published MCP server does not depend on the MCP SDK or Zod", () => {
  expect(Object.keys(manifest.dependencies)).not.toContain("@modelcontextprotocol/server");
  expect(Object.keys(manifest.dependencies)).not.toContain("zod");
});

test("a failed transport start does not keep the server connected", async () => {
  const server = createMcpServer({ query: () => ({ scope: "x", provenance: "x" }) });
  await expect(
    server.connect({
      start: async () => {
        throw new Error("offline");
      },
      close: async () => {},
      send: async () => {},
    }),
  ).rejects.toThrow("offline");
  const [c, s] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  try {
    await server.connect(s);
    await client.connect(c);
    expect(client.getServerVersion()?.version).toBe(manifest.version);
    expect((await client.listTools()).tools).toHaveLength(15);
  } finally {
    await client.close();
    await server.close();
  }
});

test("late events from an earlier transport cannot close a later connection", async () => {
  const server = createMcpServer({ query: () => ({ scope: "x", provenance: "x" }) });
  const [firstClient, firstServer] = InMemoryTransport.createLinkedPair();
  const first = new Client({ name: "first", version: "1" });
  await server.connect(firstServer);
  await first.connect(firstClient);
  const lateClose = firstServer.onclose;
  await server.close();
  await first.close();
  const [secondClient, secondServer] = InMemoryTransport.createLinkedPair();
  const second = new Client({ name: "second", version: "1" });
  try {
    await server.connect(secondServer);
    await second.connect(secondClient);
    lateClose?.();
    expect((await second.listTools()).tools).toHaveLength(15);
  } finally {
    await second.close();
    await server.close();
  }
});

test("transport send failures are reported and close the connection", async () => {
  const server = createMcpServer({ query: () => ({ scope: "x", provenance: "x" }) });
  let closed!: () => void;
  const done = new Promise<void>((resolve) => {
    closed = resolve;
  });
  const errors: Error[] = [];
  const transport = {
    onmessage: undefined as ((message: Record<string, unknown>) => void) | undefined,
    onclose: undefined as (() => void) | undefined,
    onerror: (error: Error) => {
      errors.push(error);
    },
    start: async () => {},
    send: async () => {
      throw new Error("sensitive transport detail");
    },
    close: async () => {
      closed();
    },
  };
  await server.connect(transport);
  transport.onmessage?.({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    },
  });
  await done;
  expect(errors).toHaveLength(1);
  expect(errors[0]?.message).toBe("Governator MCP transport error");
}, 5000);
