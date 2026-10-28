/* CLI adapter: dynamic command definitions map Effect's typed flag values to the existing domain handlers. */
/* oxlint-disable linteffect/no-naked-object-state-update, linteffect/no-return-in-arrow, linteffect/no-string-sentinel-const, linteffect/no-throw-in-effect, linteffect/no-if-statement, linteffect/no-magic-domain-string, linteffect/no-effect-wrapper-alias, linteffect/prefer-extracted-concept, linteffect/no-pipe-ladder, linteffect/no-ternary, linteffect/no-call-tower, linteffect/no-inline-runtime-provide */
import * as BunServices from "@effect/platform-bun/BunServices";
import { Console, Effect, Option, Result } from "effect";
import { CliConfig, Command, Flag, GlobalFlag } from "effect/cli";
import { GovernanceError, ensure } from "@governator/core";

type Selected = { kind: "command"; command: string; values: Map<string, string>; demo: boolean };
export type ParsedCli = Selected | { kind: "help"; text: string };

export async function parseCli(args: readonly string[]): Promise<ParsedCli> {
  // Effect 4.0.6 currently accepts duplicate flag occurrences, but Governator rejects them.
  const seen = new Set<string>();
  const normalized: string[] = [];
  let enteredOptions = false;
  for (let index = 0; index < args.length; index++) {
    const token = args[index]!;
    ensure(token.length > 0, "Empty arguments are not allowed");
    if (!token.startsWith("--")) {
      ensure(!enteredOptions && !token.startsWith("-"), `Unexpected argument: ${token}`);
      normalized.push(token);
      continue;
    }
    enteredOptions = true;
    ensure(!token.includes("=") && token !== "--no-demo", `Unsupported option: ${token}`);
    if (token === "--help") {
      normalized.push(token);
      continue;
    }
    ensure(!seen.has(token), `Duplicate option: ${token}`);
    seen.add(token);
    if (token === "--demo") {
      normalized.push(token);
      continue;
    }
    const value = args[++index];
    ensure(!!value && !value.startsWith("--"), `Missing value for ${token}`);
    if (value.startsWith("-")) normalized.push(`${token}=${value}`);
    else normalized.push(token, value);
  }
  let selected: Selected | undefined;
  let output = "";
  const sink: Console.Console = Object.assign(Object.create(console), {
    log: (...values: unknown[]) => {
      output += values.map(String).join(" ") + "\n";
    },
    error: (...values: unknown[]) => {
      output += values.map(String).join(" ") + "\n";
    },
  });
  const leaf = (name: string, command: string, keys: readonly string[], allowDemo = false) => {
    const strings: Record<string, Flag.Flag<Option.Option<string>>> = Object.fromEntries(
      keys.map((key) => [key, Flag.String(key).pipe(Flag.optional)]),
    );
    const save = (input: Record<string, unknown>, demo: boolean) =>
      Effect.sync(() => {
        const values = new Map<string, string>();
        for (const key of keys) {
          const value = input[key];
          if (Option.isOption(value) && Option.isSome(value) && typeof value.value === "string")
            values.set(`--${key}`, value.value);
        }
        selected = { kind: "command", command, values, demo };
      });
    if (allowDemo)
      return Command.make(
        name,
        { ...strings, demo: Flag.Boolean("demo").pipe(Flag.withDefault(false)) },
        (input) => save(input, input.demo),
      );
    return Command.make(name, strings, (input) => save(input, false));
  };
  const root = Command.make("governator").pipe(
    Command.withSubcommands([
      leaf("validate", "validate", [
        "root",
        "target",
        "component",
        "at",
        "format",
        "report-schema",
      ]),
      leaf(
        "evaluate",
        "evaluate",
        ["root", "target", "component", "at", "format", "report-schema"],
        true,
      ),
      leaf("check", "check", ["root", "format", "mapping", "target", "component", "report-schema"]),
      leaf("query", "query", ["root", "snapshot", "tool", "args"]),
      Command.make("snapshot").pipe(
        Command.withSubcommands([
          leaf("export", "snapshot.export", ["root", "report", "release", "config", "out"]),
        ]),
      ),
      Command.make("evidence").pipe(
        Command.withSubcommands([
          leaf("import", "evidence.import", [
            "root",
            "format",
            "file",
            "mapping",
            "commit",
            "report-root",
          ]),
        ]),
      ),
      Command.make("release").pipe(
        Command.withSubcommands([
          leaf("candidate", "release.candidate", ["root", "config", "out"]),
          leaf("plan", "release.plan", ["root", "config", "candidate"], true),
          leaf("check", "release.check", ["root", "config", "candidate"], true),
        ]),
      ),
      Command.make("contracts").pipe(
        Command.withSubcommands([
          leaf("snapshot", "contracts.snapshot", ["root", "config", "declarations"]),
          leaf("diff", "contracts.diff", ["root", "baseline", "candidate", "baseline-digest"]),
        ]),
      ),
    ]),
  );
  const command = Command.runWith(root, { version: "0.1.0", renderErrors: false })(
    normalized.length ? normalized : ["--help"],
  );
  const parsed = await Effect.runPromise(
    Effect.result(
      command.pipe(
        Effect.provideService(Console.Console, sink),
        Effect.provide(CliConfig.layer({ builtIns: [GlobalFlag.Help] })),
        Effect.provide(BunServices.layer),
      ),
    ),
  );
  if (Result.isFailure(parsed)) {
    const failure = parsed.failure;
    const message =
      failure._tag === "ShowHelp" && failure.errors.length > 0
        ? failure.errors.map((error) => error.message).join("; ")
        : failure.message;
    throw new GovernanceError({ message });
  }
  if (selected) return selected;
  if (output) return { kind: "help", text: output };
  throw new GovernanceError({ message: "No command selected" });
}
