import { createHash, randomUUID } from "node:crypto";
import { lstat, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { loadCsf } from "storybook/internal/csf-tools";
import { editComponentTags } from "./tag-csf.ts";

const reserved = new Set(["dev", "test", "autodocs", "manifest", "play-fn", "test-fn"]);
const revision = (text: string) => createHash("sha256").update(text).digest("hex");
const writes = new Map<string, Promise<void>>();
async function storyFile(root: string, input: string): Promise<string> {
  if (
    !input.startsWith("./") ||
    input.includes("\\") ||
    input.includes("\0") ||
    !/\.stories\.(?:ts|tsx|js|jsx|mjs)$/.test(input)
  )
    throw new Error("Invalid story path");
  const base = await realpath(root);
  const target = resolve(base, input);
  const rel = relative(base, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error("Story outside project");
  const canonical = await realpath(target);
  if (canonical !== target || !(await lstat(target)).isFile())
    throw new Error("Story path must be a regular file without symlinks");
  return target;
}
function parseTags(source: string, file: string): string[] {
  editComponentTags(source, file, []); // Validate that the file can be edited safely.
  const csf = loadCsf(source, { fileName: file, makeTitle: (title) => title ?? "" }).parse();
  return (csf.meta?.tags ?? []).filter(
    (tag) => !tag.startsWith("!") && !tag.startsWith("governator:component:") && !reserved.has(tag),
  );
}
async function readSource(file: string): Promise<string> {
  const info = await lstat(file);
  if (!info.isFile() || info.size > 1_000_000) throw new Error("Unsupported story file");
  return readFile(file, "utf8");
}
export async function getComponentTags(root: string, path: string) {
  const file = await storyFile(root, path);
  const source = await readSource(file);
  return { tags: parseTags(source, file), revision: revision(source) };
}
export async function saveComponentTags(
  root: string,
  path: string,
  expected: string,
  tags: readonly string[],
) {
  const file = await storyFile(root, path);
  const previous = writes.get(file) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = previous.then(() => gate);
  writes.set(file, current);
  await previous;
  try {
    if ((await storyFile(root, path)) !== file)
      throw new Error("Story changed; reload before saving");
    const source = await readSource(file);
    if (revision(source) !== expected) throw new Error("Story changed; reload before saving");
    const output = editComponentTags(source, file, tags);
    const temp = resolve(dirname(file), `.governator-${randomUUID()}.tmp`);
    const mode = (await lstat(file)).mode & 0o777;
    try {
      const handle = await open(temp, "wx", mode);
      try {
        await handle.chmod(mode);
        await handle.writeFile(output, "utf8");
      } finally {
        await handle.close();
      }
      if ((await storyFile(root, path)) !== file || revision(await readSource(file)) !== expected)
        throw new Error("Story changed; reload before saving");
      await rename(temp, file);
    } finally {
      await unlink(temp).catch(() => {});
    }
    return { tags: parseTags(output, file), revision: revision(output) };
  } finally {
    release();
    if (writes.get(file) === current) writes.delete(file);
  }
}
