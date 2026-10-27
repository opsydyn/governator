import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Refuse tsdown cleaning if an output tree contains a link to another tree. */
export function assertSafeBuildOutput(path: string): void {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) return;
  if (stat.isSymbolicLink()) throw new Error(`Refusing to clean linked build output: ${path}`);
  if (stat.isDirectory())
    for (const entry of readdirSync(path)) assertSafeBuildOutput(join(path, entry));
}
