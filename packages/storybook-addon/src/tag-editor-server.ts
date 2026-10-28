import type { IncomingMessage, ServerResponse } from "node:http";
import { getComponentTags, saveComponentTags } from "./tag-storage.ts";
import { readRegistryEditor, resolveMappedStory, saveRegistryEditor } from "./registry-editor.ts";
import { registryMatchesReport } from "./registry-source.ts";
import type { Component } from "../../core/src/domain.ts";

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
export function tagEditor(options?: { registry?: { root: string; path: string } }) {
  return {
    name: "governator-tag-editor",
    apply: "serve" as const,
    configureServer(server: Server) {
      if (options?.registry) {
        const config = options.registry;
        server.middlewares.use("/__governator/registry-source", (req, res) => {
          const permitted = allowedTagEditorRequest({
            method: req.method,
            host: req.headers.host,
            origin: req.headers.origin,
            remoteAddress: req.socket.remoteAddress,
            contentType: req.headers["content-type"],
          });
          if (
            req.method !== "GET" ||
            !permitted ||
            ![undefined, "same-origin", "none"].includes(req.headers["sec-fetch-site"])
          ) {
            res.writeHead(403).end();
            return;
          }
          const commit =
            new URL(req.url ?? "", "http://localhost").searchParams.get("commit") ?? "";
          void registryMatchesReport(config.root, config.path, commit).then((matches) => {
            res.writeHead(200, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            });
            res.end(JSON.stringify({ matches }));
          });
        });
        server.middlewares.use("/__governator/registry-editor", (req, res) => {
          const send = (status: number, data: unknown) => {
            res.writeHead(status, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            });
            res.end(JSON.stringify(data));
          };
          if (
            !allowedTagEditorRequest({
              method: req.method,
              host: req.headers.host,
              origin: req.headers.origin,
              remoteAddress: req.socket.remoteAddress,
              contentType: req.headers["content-type"],
            }) ||
            ![undefined, "same-origin", "none"].includes(req.headers["sec-fetch-site"])
          ) {
            send(403, { error: "Editor request denied" });
            return;
          }
          const execute = async () => {
            const getMap = (server as unknown as Record<symbol, unknown>)[
              Symbol.for("governator.story-map")
            ];
            if (typeof getMap !== "function") throw new Error("Story mapping unavailable");
            const editor = {
              root: config.root,
              registryPath: config.path,
              resolveStory: async (storyId: string) =>
                resolveMappedStory(config.root, server.config.root, await getMap(), storyId),
            };
            if (req.method === "GET") {
              const url = new URL(req.url ?? "", "http://localhost");
              send(
                200,
                await readRegistryEditor(
                  editor,
                  url.searchParams.get("storyId") ?? "",
                  url.searchParams.get("componentId") ?? "",
                ),
              );
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
              !("storyId" in data) ||
              typeof data.storyId !== "string" ||
              !("componentId" in data) ||
              typeof data.componentId !== "string" ||
              !("revision" in data) ||
              typeof data.revision !== "string" ||
              !("component" in data) ||
              !data.component ||
              typeof data.component !== "object"
            )
              throw new Error("Invalid request");
            send(
              200,
              await saveRegistryEditor(
                editor,
                data.storyId,
                data.componentId,
                data.revision,
                data.component as Component,
              ),
            );
          };
          void execute().catch((error: unknown) =>
            send(error instanceof Error && error.message.includes("changed") ? 409 : 400, {
              error: error instanceof Error ? error.message : "Unable to edit registry",
            }),
          );
        });
      }
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
