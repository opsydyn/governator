import { describe, expect, test } from "vitest";
import { parseCli } from "../packages/cli/src/parser.ts";

describe("Effect command parser", () => {
  test("parses nested release commands and preserves flags", async () => {
    const result = await parseCli([
      "release",
      "plan",
      "--config",
      "governance/release.json",
      "--demo",
    ]);
    expect(result).toMatchObject({ kind: "command", command: "release.plan", demo: true });
    expect(result.kind === "command" && result.values.get("--config")).toBe(
      "governance/release.json",
    );
  });
  test("supports source queries and optional flags", async () => {
    const result = await parseCli([
      "query",
      "--snapshot",
      "artifacts/report.json",
      "--tool",
      "list_components",
    ]);
    expect(result).toMatchObject({ kind: "command", command: "query", demo: false });
  });
  test("rejects duplicate, unknown and missing options", async () => {
    for (const args of [
      ["validate", "--root", "a", "--root", "b"],
      ["evaluate", "--wat"],
      ["validate", "--wizard"],
      ["validate", "--root", ""],
      ["validate", "--root="],
      ["validate", "--root", "--help"],
      ["evaluate", "--demo", "true"],
      ["evaluate", "--no-demo"],
      ["evaluate", "--demo", "--no-demo"],
      ["release", "plan", "--config=x", "--candidate="],
      ["release", "plan", "--config", "x", "--candidate", ""],
      ["evaluate", "--demo", "--demo"],
      ["release", "plan", "--config"],
    ]) {
      await expect(parseCli(args)).rejects.toThrow();
    }
  });
  test("produces command-specific help without running a handler", async () => {
    const result = await parseCli(["contracts", "snapshot", "--help"]);
    expect(result).toMatchObject({ kind: "help" });
    expect(result.kind === "help" && result.text).toContain("snapshot");
  });
});

test("reports the underlying invalid option or command rather than a help request", async () => {
  await expect(parseCli(["validate", "--bad"])).rejects.toThrow(/--bad/);
  await expect(parseCli(["unknown-command"])).rejects.toThrow(/unknown-command/i);
  await expect(parseCli(["validate", "--root"])).rejects.toThrow(/root/i);
});

test("keeps a single-dash flag value as data instead of interpreting it as help", async () => {
  const result = await parseCli(["release", "check", "--config", "x", "--candidate", "-h"]);
  expect(result.kind).toBe("command");
  expect(result.kind === "command" && result.values.get("--candidate")).toBe("-h");
});
