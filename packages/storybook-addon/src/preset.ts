import type { Indexer } from "storybook/internal/types";
import type { IncomingMessage, ServerResponse } from "node:http";
import { storyMapFromIndex, wrapIndexers } from "./story-index.ts";

export const experimental_indexers = (indexers: Indexer[] = []) => wrapIndexers(indexers);

type Generator = {
  getIndex: () => Promise<unknown>;
  onInvalidated?: (listener: () => void) => unknown;
};
type Options = { presets: { apply: (name: string) => Promise<unknown> } };
type ViteConfig = { plugins?: unknown[]; [key: string]: unknown };
type Server = {
  middlewares: {
    use: (
      path: string,
      handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void,
    ) => void;
  };
};

/** Serve/build a source-derived sidecar without adding technical tags to Storybook's index. */
export function viteFinal(config: ViteConfig, options: Options): ViteConfig {
  let generation = 0;
  const generator = Promise.resolve()
    .then(() => options.presets.apply("storyIndexGenerator"))
    .then((value) => {
      if (
        !value ||
        typeof value !== "object" ||
        !("getIndex" in value) ||
        typeof value.getIndex !== "function"
      )
        return undefined;
      const result = value as Generator;
      result.onInvalidated?.(() => {
        generation++;
      });
      return result;
    })
    .catch(() => undefined);
  const getMap = async () => {
    try {
      const current = await generator;
      if (!current) return { version: 1, stories: [] };
      const started = generation;
      const index = await current.getIndex();
      const map = await storyMapFromIndex(index, process.cwd());
      return started === generation ? map : { version: 1, stories: [] };
    } catch {
      return { version: 1, stories: [] };
    }
  };
  const plugin = {
    name: "governator-story-map",
    configureServer(server: Server) {
      Object.assign(server, { [Symbol.for("governator.story-map")]: getMap });
      server.middlewares.use("/governator-story-map.json", (req, res, next) => {
        if (req.url && !["/", ""].includes(req.url.split("?")[0] ?? "")) return next();
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.statusCode = 405;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        void getMap().then((map) =>
          res.end(req.method === "HEAD" ? undefined : JSON.stringify(map)),
        );
      });
    },
    async generateBundle(this: {
      emitFile: (asset: { type: "asset"; fileName: string; source: string }) => void;
    }) {
      this.emitFile({
        type: "asset",
        fileName: "governator-story-map.json",
        source: JSON.stringify(await getMap()),
      });
      this.emitFile({
        type: "asset",
        fileName: "__governator/registry-source",
        source: JSON.stringify({ snapshot: true }),
      });
    },
  };
  return { ...config, plugins: [...(config.plugins ?? []), plugin] };
}

export const managerEntries = (entries: string[] = []) => [
  ...entries,
  decodeURIComponent(new URL("./manager.js", import.meta.url).pathname).replace(
    /^\/([A-Za-z]:\/)/,
    "$1",
  ),
];
