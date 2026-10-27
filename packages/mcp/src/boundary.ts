import { QueryError } from "@governanator/query";
import type { QueryService, ToolName } from "@governanator/query";
import type { CallToolResult } from "@modelcontextprotocol/server";

/** MCP serialization/error boundary; domain checks remain in the shared query service. */
export function callQueryTool(
  service: QueryService,
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
          text: `Governanator ${result.scope}; ${result.provenance}. Full query envelope is in structuredContent.`,
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
    const error =
      cause instanceof QueryError
        ? { code: cause.code, message: cause.message }
        : {
            code: signal.aborted ? "cancelled" : "invalid_request",
            message: signal.aborted
              ? "Query cancelled"
              : "Invalid query arguments or runtime query failure",
          };
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error }) }] };
  }
}
