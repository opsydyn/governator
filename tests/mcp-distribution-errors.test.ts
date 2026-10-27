import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { expect, test } from "vitest";
import { QueryError } from "../packages/query/src/index.ts";
import { createMcpServer as createSourceServer } from "../packages/mcp/src/server.ts";
import { createMcpServer as createBuiltServer } from "../packages/mcp/dist/server.mjs";
import { callQueryTool } from "../packages/mcp/src/boundary.ts";

const generic = {
  code: "invalid_request",
  message: "Invalid query arguments or runtime query failure",
};

for (const [label, createServer] of [
  ["source", createSourceServer],
  ["built", createBuiltServer],
] as const) {
  test.each([
    "invalid_request",
    "invalid_snapshot",
    "stale_snapshot",
    "result_too_large",
    "unknown_component",
  ])(
    `${label} public server preserves constrained query error %s across bundle copies`,
    async (code) => {
      const server = createServer({
        query: () => {
          throw new QueryError({ code, message: "Snapshot expired" });
        },
      });
      const client = new Client({ name: "distribution-error-test", version: "0.1.0" });
      const [c, s] = InMemoryTransport.createLinkedPair();
      await (async () => {
        await server.connect(s);
        await client.connect(c);
        const response = await client.callTool({ name: "get_design_system_report", arguments: {} });
        expect(response.isError).toBe(true);
        expect(response.structuredContent).toBeUndefined();
        expect(response.content).toEqual([
          { type: "text", text: JSON.stringify({ error: { code, message: "Snapshot expired" } }) },
        ]);
      })().finally(async () => {
        await client.close();
        await server.close();
      });
    },
  );
  test.each([
    new Error("private runtime detail"),
    new QueryError({ code: "approved", message: "trusted" }),
    new QueryError({ code: "stale_snapshot", message: "" }),
    new QueryError({ code: "stale_snapshot", message: "x".repeat(8193) }),
    { code: "stale_snapshot", message: "missing error tag" },
  ])(`${label} public server keeps unknown or malformed errors generic (%#)`, async (cause) => {
    const server = createServer({
      query: () => {
        throw cause;
      },
    });
    const client = new Client({ name: "distribution-error-test", version: "0.1.0" });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await (async () => {
      await server.connect(s);
      await client.connect(c);
      const response = await client.callTool({ name: "get_design_system_report", arguments: {} });
      expect(response.isError).toBe(true);
      expect(response.structuredContent).toBeUndefined();
      expect(response.content).toEqual([
        { type: "text", text: JSON.stringify({ error: generic }) },
      ]);
    })().finally(async () => {
      await client.close();
      await server.close();
    });
  });
}

test("cancellation and unrelated failures retain their existing boundary responses", () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const result = callQueryTool(
    {
      query: () => {
        calls++;
        throw new Error("unused");
      },
    },
    "get_design_system_report",
    {},
    controller.signal,
  );
  expect(calls).toBe(0);
  expect(result).toEqual({
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: { code: "cancelled", message: "Query cancelled" } }),
      },
    ],
  });
});

test("cancellation during a service failure remains cancelled and tagged field getters are not evaluated", () => {
  const controller = new AbortController();
  const result = callQueryTool(
    {
      query: () => {
        controller.abort();
        throw new Error("private");
      },
    },
    "get_design_system_report",
    {},
    controller.signal,
  );
  expect(result).toEqual({
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: { code: "cancelled", message: "Query cancelled" } }),
      },
    ],
  });
  let getters = 0;
  const malformed = Object.defineProperties(new Error("private"), {
    _tag: { value: "QueryError" },
    code: {
      get() {
        getters++;
        throw new Error("Accessor evaluated");
      },
    },
  });
  const response = callQueryTool(
    {
      query: () => {
        throw malformed;
      },
    },
    "get_design_system_report",
    {},
    new AbortController().signal,
  );
  expect(getters).toBe(0);
  expect(response).toEqual({
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: generic }) }],
  });
});
