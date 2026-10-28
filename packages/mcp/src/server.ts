import { McpServer } from "@modelcontextprotocol/server";
import { Schema } from "effect";
import {
  toolNames,
  toolInputs,
  toolInputJsonSchema,
  queryJsonSchema,
  QueryEnvelope,
} from "@governator/query";
import type { McpQueryService } from "./service.ts";
import { callQueryTool } from "./boundary.ts";

function standardSchema(
  schema: Schema.ConstraintDecoder<unknown>,
  jsonSchema: Record<string, unknown>,
) {
  const standard = Schema.toStandardSchemaV1(schema, {
    parseOptions: { onExcessProperty: "error" },
  });
  return {
    "~standard": {
      ...standard["~standard"],
      jsonSchema: { input: () => jsonSchema, output: () => jsonSchema },
    },
  };
}

export function createMcpServer(service: McpQueryService): McpServer {
  const server = new McpServer(
    { name: "governator", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  const outputSchema = standardSchema(QueryEnvelope, queryJsonSchema().schema);
  for (const name of toolNames)
    server.registerTool(
      name,
      {
        description: `Read ${name.replaceAll("_", " ")} from the selected immutable local governance snapshot. Recorded results are unverified; no producer execution, edits or approvals.`,
        inputSchema: standardSchema(toolInputs[name], toolInputJsonSchema(name)),
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
