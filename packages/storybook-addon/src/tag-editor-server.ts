import type { IncomingMessage, ServerResponse } from "node:http";
import { getComponentTags, saveComponentTags } from "./tag-storage.ts";

type RequestInfo = {
  method?: string | undefined;
  host?: string | undefined;
  origin?: string | undefined;
  remoteAddress?: string | undefined;
  contentType?: string | undefined;
};
export function allowedTagEditorRequest(request: RequestInfo): boolean {
  const host = request.host ?? "";
  if (!/^(?:localhost|127\.0\.0\.1):\d{1,5}$/.test(host)) return false;
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.remoteAddress ?? "")) return false;
  if (request.origin && request.origin !== `http://${host}`) return false;
  if (request.method === "POST")
    return (
      request.origin === `http://${host}` &&
      /^application\/json(?:\s*;.*)?$/i.test(request.contentType ?? "")
    );
  return request.method === "GET";
}
type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
type Server = {
  middlewares: { use: (path: string, fn: Middleware) => void };
  config: { root: string };
};

/** Opt-in Vite dev-server integration; never installed into a static build. */
export function tagEditor() {
  return {
    name: "governator-tag-editor",
    apply: "serve" as const,
    configureServer(server: Server) {
      server.middlewares.use("/__governator/tag-editor", (req, res) => {
        const send = (status: number, data: unknown) => {
          res.writeHead(status, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          });
          res.end(JSON.stringify(data));
        };
        const permitted = allowedTagEditorRequest({
          method: req.method,
          host: req.headers.host,
          origin: req.headers.origin,
          remoteAddress: req.socket.remoteAddress,
          contentType: req.headers["content-type"],
        });
        if (
          !permitted ||
          ![undefined, "same-origin", "none"].includes(req.headers["sec-fetch-site"])
        ) {
          send(403, { error: "Editor request denied" });
          return;
        }
        const execute = async () => {
          if (req.method === "GET") {
            const path = new URL(req.url ?? "", "http://localhost").searchParams.get("path") ?? "";
            send(200, await getComponentTags(server.config.root, path));
            return;
          }
          let body = "";
          for await (const chunk of req) {
            body += String(chunk);
            if (body.length > 16_384) throw new Error("Request too large");
          }
          const data: unknown = JSON.parse(body);
          if (
            !data ||
            typeof data !== "object" ||
            !("path" in data) ||
            typeof data.path !== "string" ||
            !("revision" in data) ||
            typeof data.revision !== "string" ||
            !("tags" in data) ||
            !Array.isArray(data.tags) ||
            data.tags.some((tag: unknown) => typeof tag !== "string")
          )
            throw new Error("Invalid request");
          send(
            200,
            await saveComponentTags(server.config.root, data.path, data.revision, data.tags),
          );
        };
        void execute().catch((error: unknown) =>
          send(error instanceof Error && error.message.includes("changed") ? 409 : 400, {
            error: error instanceof Error ? error.message : "Unable to edit tags",
          }),
        );
      });
    },
  };
}
