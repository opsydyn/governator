/** The minimal query capability accepted by the public MCP adapter. */
export interface McpQueryService {
  query(
    name: string,
    args: unknown,
  ): {
    readonly scope: string;
    readonly provenance: string;
    readonly [key: string]: unknown;
  };
}
