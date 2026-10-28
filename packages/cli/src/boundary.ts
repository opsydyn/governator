import { Effect, Match } from "effect";
import { GovernanceError } from "@governator/core";
import { executeCli } from "./commands.ts";
import type { CliResult } from "./commands.ts";

const toError = (cause: unknown): GovernanceError =>
  Match.value(cause).pipe(
    Match.when(Match.instanceOf(GovernanceError), (error) => error),
    Match.orElse((error) => new GovernanceError({ message: String(error) })),
  );
export const runCli = (args: readonly string[]): Promise<CliResult> => {
  const program = Effect.tryPromise({ try: () => executeCli(args), catch: toError });
  const handled = program.pipe(
    Effect.match({
      onSuccess: (result) => result,
      onFailure: (cause) => ({
        code: 2 as const,
        stdout: "",
        stderr: `Governator input/runtime error: ${cause.message}\n`,
      }),
    }),
  );
  return Effect.runPromise(handled);
};
