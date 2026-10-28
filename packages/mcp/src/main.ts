#!/usr/bin/env bun
import { Effect } from "effect";
import { start } from "./startup.ts";

await Effect.runPromise(
  Effect.tryPromise({
    try: () => start(Bun.argv.slice(2)),
    catch: () =>
      "Governator MCP startup failed: invalid options or snapshot; export a fresh snapshot for a clean matching source.\n",
  }).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        process.stderr.write(error);
        process.exitCode = 2;
      }),
    ),
  ),
);
