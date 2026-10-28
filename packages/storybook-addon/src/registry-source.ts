import { execFile } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
/** Compare local Git source bytes, not report authenticity or policy approval. */
export async function registryMatchesReport(
  root: string,
  path: string,
  commit: string,
): Promise<boolean> {
  try {
    if (
      !/^[a-f0-9]{40}$/.test(commit) ||
      !path ||
      isAbsolute(path) ||
      path.includes("\\") ||
      path.includes("\0") ||
      path.includes(":") ||
      path.split("/").includes("..")
    )
      return false;
    const base = await realpath(root);
    const target = resolve(base, path);
    const rel = relative(base, target);
    if (
      !rel ||
      rel === ".." ||
      rel.startsWith(`..${sep}`) ||
      isAbsolute(rel) ||
      (await realpath(target)) !== target ||
      !(await lstat(target)).isFile() ||
      (await lstat(target)).size > 4 * 1024 * 1024
    )
      return false;
    const git = async (args: string[]) =>
      (
        await exec(
          "git",
          ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "-C", base, ...args],
          {
            encoding: "buffer",
            maxBuffer: 4 * 1024 * 1024 + 1024,
            timeout: 10_000,
            env: {
              PATH: "/usr/bin:/bin",
              GIT_CONFIG_NOSYSTEM: "1",
              GIT_CONFIG_GLOBAL: "/dev/null",
              GIT_OPTIONAL_LOCKS: "0",
            },
          },
        )
      ).stdout;
    const top = (await git(["rev-parse", "--show-toplevel"])).toString().trim();
    if ((await realpath(top)) !== base) return false;
    const head = (await git(["rev-parse", "HEAD"])).toString().trim();
    if (head !== commit) return false;
    const tree = await git(["cat-file", "blob", `${head}:${rel}`]);
    const index = await git(["cat-file", "blob", `:${rel}`]);
    const working = await readFile(target);
    if (!working.equals(tree) || !index.equals(tree)) return false;
    return (
      (await git(["rev-parse", "HEAD"])).toString().trim() === head &&
      (await git(["cat-file", "blob", `:${rel}`])).equals(index) &&
      (await realpath(target)) === target &&
      (await readFile(target)).equals(working)
    );
  } catch {
    return false;
  }
}
