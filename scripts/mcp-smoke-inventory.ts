import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { git } from "../packages/query/src/io.ts";
import { bytesDigest } from "../packages/query/src/archive.ts";

/** Hash every byte of the repository-specific Git index for the smoke audit. */
export async function gitIndexDigest(root: string): Promise<string> {
  return bytesDigest(
    await readFile(resolve(root, git(root, ["rev-parse", "--git-path", "index"]))),
  );
}
