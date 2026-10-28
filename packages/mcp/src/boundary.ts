import { QueryError } from "@governator/query";
import type { ToolName } from "@governator/query";
import type { CallToolResult } from "@modelcontextprotocol/server";

import type { McpQueryService } from "./service.ts";

const queryErrorCodes = new Set([
  "invalid_request",
  "invalid_snapshot",
  "stale_snapshot",
  "result_too_large",
  "unknown_component",
]);

/** Bundled callers can hold a different QueryError constructor. This shape only
 * controls an error response; it never authorizes a successful query or trust state. */
function queryErrorResponse(cause: unknown): { code: string; message: string } | undefined {
  if (!(cause instanceof Error)) return;
  const fields = Object.getOwnPropertyDescriptors(cause);
  const tag: unknown = fields._tag?.value;
  const code: unknown = fields.code?.value;
  const message: unknown = fields.message?.value;
  if (
    tag === "QueryError" &&
    typeof code === "string" &&
    queryErrorCodes.has(code) &&
    typeof message === "string" &&
    message.length > 0 &&
    message.length <= 8192
  )
    return { code, message };
}

/** MCP serialization/error boundary; domain checks remain in the shared query service. */
export function callQueryTool(
  service: McpQueryService,
  name: ToolName,
  args: unknown,
  signal: AbortSignal,
): CallToolResult {
  try {
    signal.throwIfAborted();
    const result = service.query(name, args);
    signal.throwIfAborted();
    const response: CallToolResult = {
      content: [
        {
          type: "text",
          text: `Governator ${result.scope}; ${result.provenance}. Full query envelope is in structuredContent.`,
        },
      ],
      structuredContent: result,
    };
    if (new TextEncoder().encode(JSON.stringify(response)).length > 128 * 1024)
      throw new QueryError({
        code: "result_too_large",
        message: "MCP response exceeds 128 KiB; use paginated queries",
      });
    return response;
  } catch (cause) {
    const error = queryErrorResponse(cause) ?? {
      code: signal.aborted ? "cancelled" : "invalid_request",
      message: signal.aborted
        ? "Query cancelled"
        : "Invalid query arguments or runtime query failure",
    };
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error }) }] };
  }
}
