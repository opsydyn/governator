import { loadSnapshot, createQueryService, queryEnsure } from "@governator/query";
import { createMcpServer } from "./server.ts";

export async function start(args: readonly string[]) {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(
      "governator-mcp --root PATH --snapshot PATH\nRead-only local stdio. Generate a snapshot explicitly with the Governator CLI.\n",
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
  const server = createMcpServer(service);
  let pending = Buffer.alloc(0);
  let closed = false;
  const transport = {
    onmessage: undefined as ((message: Record<string, unknown>) => void) | undefined,
    onclose: undefined as (() => void) | undefined,
    onfinished: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    async start() {
      process.stdin.on("data", onData);
      process.stdin.once("end", onEnd);
      process.stdin.resume();
    },
    async send(message: Record<string, unknown>) {
      await new Promise<void>((resolve, reject) => {
        process.stdout.write(`${JSON.stringify(message)}\n`, (error) =>
          error ? reject(error) : resolve(),
        );
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.pause();
    },
  };
  const stop = () => {
    void server.close();
  };
  transport.onfinished = stop;
  const onEnd = () => {
    transport.onclose?.();
  };
  const fail = () => {
    process.stderr.write("Governator MCP transport error\n");
    process.exitCode = 2;
    stop();
  };
  transport.onerror = fail;
  const onData = (chunk: Buffer) => {
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline < 0 ? chunk.length : newline;
      const segment = chunk.subarray(offset, end);
      if (pending.length + segment.length > 16384) {
        fail();
        return;
      }
      pending = Buffer.concat([pending, segment]);
      if (newline < 0) return;
      try {
        if (pending.length)
          transport.onmessage?.(JSON.parse(pending.toString("utf8")) as Record<string, unknown>);
        pending = Buffer.alloc(0);
      } catch {
        fail();
        return;
      }
      offset = newline + 1;
    }
  };
  await server.connect(transport);
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
