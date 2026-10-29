import { cp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertSafeBuildOutput } from "./safe-build-output.ts";

/** Copy assets after tsdown succeeds, into its actual selected output directory. */
export async function packageCliSkill({
  options,
}: {
  options: { cwd: string; outDir: string };
}): Promise<void> {
  const root = resolve(import.meta.dirname, "..");
  const target = resolve(options.cwd, options.outDir, "skills/governator-onboarding");
  assertSafeBuildOutput(target);
  await mkdir(join(target, "references"), { recursive: true });
  for (const file of ["SKILL.md", "references/setup.md"])
    await cp(join(root, "skills/governator-onboarding", file), join(target, file));
}
