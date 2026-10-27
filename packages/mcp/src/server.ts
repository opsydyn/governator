import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { toolNames, toolInputJsonSchema, queryJsonSchema } from "@governanator/query";
import type { McpQueryService } from "./service.ts";
import { callQueryTool } from "./boundary.ts";

export function createMcpServer(service: McpQueryService): McpServer {
  const server = new McpServer(
    { name: "governanator", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  const outputSchema = z.fromJSONSchema(queryJsonSchema().schema);
  for (const name of toolNames)
    server.registerTool(
      name,
      {
        description: `Read ${name.replaceAll("_", " ")} from the selected immutable local governance snapshot. Recorded results are unverified; no producer execution, edits or approvals.`,
        inputSchema: z.fromJSONSchema(toolInputJsonSchema(name)),
        outputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      (args, ctx) => callQueryTool(service, name, args, ctx.mcpReq.signal),
    );
  return server;
}
