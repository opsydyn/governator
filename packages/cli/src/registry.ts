import { resolve } from "node:path";
import { readFile, lstat } from "node:fs/promises";
import { ensure, decodeRegistry } from "@governator/core";
import { readRegistryEditor, saveRegistryEditor, resolveMappedStory } from "@governator/operations";
import { containedFile } from "./files.ts";
import type { CliResult } from "./commands.ts";

export async function runRegistryCommand(
  command: string,
  values: Map<string, string>,
): Promise<CliResult> {
  const root = resolve(values.get("--root") ?? ".");
  const readJson = async (flag: string) => {
    const path = await containedFile(root, values.get(flag) ?? "");
    ensure((await lstat(path)).size <= 4 * 1024 * 1024, "Input exceeds 4 MiB");
    return JSON.parse(await readFile(path, "utf8"));
  };
  const map: unknown = await readJson("--story-map");
  const story = values.get("--story") ?? "";
  const component = values.get("--component") ?? "";
  ensure(story.length > 0 && component.length > 0, "Provide --story and --component");
  const workingDir = resolve(root, values.get("--working-dir") ?? ".");
  const options = {
    root,
    registryPath: values.get("--registry") ?? "governance/components.yaml",
    resolveStory: (id: string) => resolveMappedStory(root, workingDir, map, id),
  };
  const result =
    command === "registry.inspect"
      ? await readRegistryEditor(options, story, component)
      : await saveRegistryEditor(
          options,
          story,
          component,
          values.get("--revision") ?? "",
          decodeRegistry({ schemaVersion: 1, components: [await readJson("--fields")] })
            .components[0]!,
        );
  return {
    code: 0,
    stdout:
      JSON.stringify(
        {
          ...result,
          nextAction: "Review the Git diff; source edits require fresh evidence and a new snapshot",
        },
        null,
        2,
      ) + "\n",
    stderr: "",
  };
}
