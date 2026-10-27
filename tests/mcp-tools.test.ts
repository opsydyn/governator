import { afterEach, expect, test } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../packages/mcp/src/server.ts";
import {
  createSnapshot,
  loadSnapshot,
  createQueryService,
  toolNames,
} from "../packages/query/src/index.ts";
import { queryProject } from "./query-fixtures.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
test("SDK discovery exposes only readonly tools and preserves result/error scope", async () => {
  const f = await queryProject();
  roots.push(f.root);
  const snapshot = await createSnapshot(f.root, { report: "artifacts/report.json" });
  await writeFile(join(f.root, "artifacts/snapshot.json"), JSON.stringify(snapshot));
  const service = createQueryService(await loadSnapshot(f.root, "artifacts/snapshot.json"));
  const server = createMcpServer(service),
    client = new Client({ name: "test", version: "0.1.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(s);
    await client.connect(c);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(toolNames);
    for (const tool of tools) {
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.outputSchema?.type).toBe("object");
    }
    const report = await client.callTool({ name: "get_design_system_report", arguments: {} });
    expect(report.isError).not.toBe(true);
    expect(report.structuredContent).toEqual(service.query("get_design_system_report"));
    const blocked = await client.callTool({
      name: "evaluate_component",
      arguments: { componentId: "ui.button", targetLifecycle: "stable" },
    });
    expect(blocked.isError).not.toBe(true);
    expect(blocked.structuredContent).toMatchObject({
      scope: "pure-unverified-evaluation",
      data: { gate: "insufficient_evidence" },
    });
    const missing = await client.callTool({
      name: "get_component",
      arguments: { componentId: "ui.unknown" },
    });
    expect(missing.isError).toBe(true);
    expect(missing.content).toEqual([
      { type: "text", text: expect.stringContaining("unknown_component") },
    ]);
    const invalid = await client.callTool({ name: "list_components", arguments: { limit: 0 } });
    expect(invalid.isError).toBe(true);
    await expect(client.callTool({ name: "publish", arguments: {} })).rejects.toThrow(/not found/);
  } finally {
    await client.close();
    await server.close();
  }
});
