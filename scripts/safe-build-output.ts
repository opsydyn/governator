import { lstatSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function assertUnlinkedTree(path: string): void {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) return;
  if (stat.isSymbolicLink()) throw new Error(`Refusing to clean linked build output: ${path}`);
  if (stat.isDirectory())
    for (const entry of readdirSync(path)) assertUnlinkedTree(join(path, entry));
}

/** Check ancestors before scanning, including when the destination does not exist yet. */
export function assertSafeBuildOutput(path: string): void {
  const target = resolve(path);
  let ancestor = target;
  while (true) {
    if (lstatSync(ancestor, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error(`Refusing to clean linked build output: ${ancestor}`);
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  assertUnlinkedTree(target);
}

/** tsdown calls build:prepare with resolved CLI options before its cleanup. */
export function assertSafeBuildPrepare({
  options,
}: {
  options: { cwd: string; outDir: string; clean: string[]; exe?: unknown; devtools?: unknown };
}): void {
  if (options.exe || options.devtools)
    throw new Error(
      "Unsupported clean override: executable and devtools outputs require separate qualification",
    );
  const output = resolve(options.cwd, options.outDir);
  // Custom globs/extra clean targets can select unrelated trees. Fail before tsdown expands them.
  for (const target of options.clean)
    if (/[!*?{}[\]]/.test(target) || resolve(options.cwd, target) !== output)
      throw new Error(`Unsupported clean override: ${target}`);
  assertSafeBuildOutput(output);
}
