import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { loadSnapshot, createQueryService, queryEnsure } from "@governanator/query";
import { createMcpServer } from "./server.ts";

export async function start(args: readonly string[]) {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(
      "governanator-mcp --root PATH --snapshot PATH\nRead-only local stdio. Generate a snapshot explicitly with the Governanator CLI.\n",
    );
    return;
  }
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i] ?? "",
      value = args[++i];
    queryEnsure(
      ["--root", "--snapshot"].includes(key) && !values.has(key),
      "Unknown or duplicate MCP startup option",
    );
    queryEnsure(!!value && !value.startsWith("--"), "Missing MCP startup option value");
    values.set(key, value);
  }
  const root = values.get("--root"),
    snapshot = values.get("--snapshot");
  queryEnsure(!!root && !!snapshot, "MCP requires --root and --snapshot");
  const service = createQueryService(await loadSnapshot(root, snapshot));
  const handle = serveStdio(() => createMcpServer(service), {
    transport: new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 16384 }),
    onerror: () => process.stderr.write("Governanator MCP transport error\n"),
  });
  process.once("SIGTERM", () => {
    void handle.close();
  });
  process.once("SIGINT", () => {
    void handle.close();
  });
}
