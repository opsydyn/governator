import { ensure } from "@governanator/core";

export function git(root: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  ensure(
    result.exitCode === 0,
    `Git source verification failed: ${result.stderr.toString().trim()}`,
  );
  return result.stdout.toString().trim();
}
export function cleanHead(root: string): string {
  const commit = git(root, ["rev-parse", "--verify", "HEAD"]);
  const entries = git(root, ["ls-files", "-v", "-z"]).split("\0").filter(Boolean);
  ensure(
    !entries.some((entry) => entry.startsWith("S ") || /^[a-z] /.test(entry)),
    "Unsupported hidden Git index flags: assume-unchanged/skip-worktree can conceal source edits",
  );
  ensure(
    git(root, ["status", "--porcelain", "--untracked-files=all"]).length === 0,
    "Dirty/uncommitted repository inputs cannot receive local test-run proof",
  );
  return commit;
}
