/* oxlint-disable linteffect/no-if-statement, linteffect/no-return-in-arrow, linteffect/no-naked-object-state-update, linteffect/no-string-sentinel-const -- Optional installed adapter boundary; the CLI does not bundle or depend on Storybook. */
import { createRequire } from "node:module";
import { realpath, lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ensure } from "@governator/core";
import { containedFile } from "./files.ts";
import type { CliResult } from "./commands.ts";

export async function runTagCommand(
  command: string,
  values: Map<string, string>,
): Promise<CliResult> {
  const root = await realpath(resolve(values.get("--root") ?? "."));
  const name = values.get("--adapter") ?? "@opsydyn/storybook-addon-governator";
  ensure(
    /^(?:@[a-z0-9_-]+\/)?[a-z0-9_-]+$/.test(name),
    "Adapter must be an installed package name",
  );
  const require = createRequire(resolve(root, "package.json"));
  // oxlint-disable-next-line linteffect/prevent-dynamic-imports -- Optional locally installed Storybook adapter; resolve only on an explicit tags command.
  const adapter = await import(pathToFileURL(require.resolve(`${name}/authoring`)).href);
  ensure(
    adapter.adapterVersion === 1 &&
      typeof adapter.getComponentTags === "function" &&
      typeof adapter.previewComponentTags === "function" &&
      typeof adapter.saveComponentTags === "function",
    "Unsupported Storybook authoring adapter; install a version exposing authoring API 1",
  );
  const story = values.get("--story-path") ?? "";
  let tags: unknown = [];
  if (command !== "tags.inspect") {
    const path = await containedFile(root, values.get("--tags") ?? "");
    ensure((await lstat(path)).size <= 8192, "Tags input exceeds 8 KiB");
    tags = JSON.parse(await readFile(path, "utf8"));
    ensure(
      Array.isArray(tags) && tags.every((tag) => typeof tag === "string"),
      "Provide a JSON array of descriptive tags",
    );
  }
  const result =
    command === "tags.inspect"
      ? await adapter.getComponentTags(root, story)
      : command === "tags.plan"
        ? await adapter.previewComponentTags(root, story, tags)
        : await adapter.saveComponentTags(root, story, values.get("--revision") ?? "", tags);
  return {
    code: 0,
    stdout:
      JSON.stringify(
        {
          ...result,
          nextAction:
            "Tags are descriptive; review the diff and refresh evidence after source edits",
        },
        null,
        2,
      ) + "\n",
    stderr: "",
  };
}
