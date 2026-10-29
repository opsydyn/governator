import {
  Context,
  Effect,
  Fiber,
  Layer,
  Logger,
  PlatformError,
  Schema,
  Sink,
  Stdio,
  Stream,
} from "effect";
import { McpProtocol, McpSchema, McpServer } from "effect/ai";
import {
  toolNames,
  toolDescriptions,
  toolInputs,
  toolInputJsonSchema,
  queryJsonSchema,
  QueryEnvelope,
} from "@governator/query";
import type { McpQueryService } from "./service.ts";
import { callQueryTool } from "./boundary.ts";

type Message = Record<string, unknown>;
type Transport = {
  onmessage?: ((message: Message) => void) | undefined;
  onclose?: (() => void) | undefined;
  onerror?: (error: Error) => void;
  onfinished?: () => void;
  start(): Promise<void>;
  send(message: Message): Promise<void>;
  close(): Promise<void>;
};

/** Creates the Effect MCP server. The transport is structurally compatible with MCP transports. */
export function createMcpServer(service: McpQueryService) {
  let fiber: ReturnType<typeof Effect.runFork> | undefined;
  let transport: Transport | undefined;
  let input: ReadableStreamDefaultController<Uint8Array> | undefined;
  async function shutdown(expected?: Transport) {
    if (expected && transport !== expected) return;
    const running = fiber;
    const current = transport;
    fiber = undefined;
    transport = undefined;
    input = undefined;
    if (current) {
      current.onmessage = undefined;
      current.onclose = undefined;
    }
    if (running) await Effect.runPromise(Fiber.interrupt(running));
    if (current) await current.close();
  }
  return {
    async connect<T>(connection: T): Promise<void> {
      if (fiber) throw new Error("MCP server is already connected");
      transport = connection as Transport;
      const current = transport;
      let output = "";
      const readable = new ReadableStream<Uint8Array>({
        start(controller) {
          input = controller;
        },
      });
      const writable = new WritableStream<string | Uint8Array>({
        close() {
          current.onfinished?.();
          queueMicrotask(() => {
            void shutdown(current);
          });
        },
        async write(chunk) {
          output += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
          let index: number;
          while ((index = output.indexOf("\n")) >= 0) {
            const line = output.slice(0, index);
            output = output.slice(index + 1);
            if (line) {
              try {
                await current.send(JSON.parse(line) as Message);
              } catch {
                current.onerror?.(new Error("Governator MCP transport error"));
                void shutdown(current);
                throw new Error("Governator MCP transport error");
              }
            }
          }
        },
      });
      const error = (cause: unknown) =>
        PlatformError.systemError({ module: "Stdio", method: "mcp", _tag: "Unknown", cause });
      const stdio = Stdio.make({
        args: Effect.succeed([]),
        stdin: Stream.fromReadableStream({ evaluate: () => readable, onError: error }),
        stdout: () => Sink.fromWritableStream({ evaluate: () => writable, onError: error }),
        stderr: () => Sink.drain,
      });
      const registration = Layer.effectDiscard(
        Effect.gen(function* () {
          const registry = yield* McpServer.McpServer;
          for (const name of toolNames) {
            const tool = new McpSchema.Tool({
              name,
              description: toolDescriptions[name],
              inputSchema: toolInputJsonSchema(name) as McpSchema.ToolJson,
              outputSchema: queryJsonSchema().schema,
              annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
              },
            });
            yield* registry.addTool({
              tool,
              annotations: Context.empty(),
              handle: (args) =>
                Effect.promise(async (signal) => {
                  try {
                    const decoded = Schema.decodeUnknownSync(toolInputs[name], {
                      onExcessProperty: "error",
                    })(args ?? {});
                    const response = callQueryTool(service, name, decoded, signal);
                    if (!response.isError && !Schema.is(QueryEnvelope)(response.structuredContent))
                      return new McpSchema.CallToolResult({
                        isError: true,
                        content: [{ type: "text", text: "Invalid query result" }],
                      });
                    return new McpSchema.CallToolResult(response);
                  } catch {
                    return new McpSchema.CallToolResult({
                      isError: true,
                      content: [{ type: "text", text: "Invalid query arguments" }],
                    });
                  }
                }),
            });
          }
        }),
      ).pipe(
        Layer.provide(
          McpServer.layerStdio({
            name: "governator",
            version: "0.1.0",
            protocols: [
              McpProtocol.v2026_07_28,
              McpProtocol.v2025_11_25,
              McpProtocol.v2025_06_18,
              McpProtocol.v2025_03_26,
              McpProtocol.v2024_11_05,
            ],
          }),
        ),
        Layer.provide(Layer.succeed(Stdio.Stdio, stdio)),
      );
      let ready!: () => void;
      let reject!: (cause: unknown) => void;
      const started = new Promise<void>((resolve, fail) => {
        ready = resolve;
        reject = fail;
      });
      fiber = Effect.runFork(
        Effect.scoped(
          Effect.gen(function* () {
            yield* Layer.build(registration);
            ready();
            yield* Effect.never;
          }),
        ).pipe(
          Effect.provideService(Logger.LogToStderr, true),
          Effect.tapCause((cause) => Effect.sync(() => reject(cause))),
        ),
      );
      current.onmessage = (message) => {
        if (transport === current)
          input?.enqueue(new TextEncoder().encode(JSON.stringify(message) + "\n"));
      };
      current.onclose = () => {
        if (transport !== current) return;
        input?.close();
        input = undefined;
      };
      try {
        await current.start();
        await started;
      } catch (cause) {
        await shutdown(current);
        throw cause;
      }
    },
    async close(): Promise<void> {
      await shutdown();
    },
  };
}
