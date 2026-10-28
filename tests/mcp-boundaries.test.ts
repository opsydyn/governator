import { expect, test } from "vitest";
import { inspectReadonlyQuery } from "../scripts/mcp-boundaries.ts";
test("readonly query boundary rejects process, network, filesystem and dynamic execution", () => {
  for (const source of [
    'Bun.spawn(["bun","test"]);',
    'fetch("https://example.invalid");',
    'import {writeFile} from "node:fs/promises";',
    'import("./producer.ts");',
    'eval("code");',
  ])
    expect(inspectReadonlyQuery(source).length).toBeGreaterThan(0);
  expect(
    inspectReadonlyQuery('import {evaluate} from "@governator/core"; evaluate(input);'),
  ).toEqual([]);
});
test("qualification guard actively blocks write, process and network attempts", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "--preload",
      "./scripts/mcp-readonly-preload.ts",
      "-e",
      'for(const attempt of [()=>Bun.spawn(["true"]),()=>Bun.write("/tmp/forbidden-mcp-write","x"),()=>fetch("https://example.invalid")]){try{await attempt()}catch{}}',
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  expect(await child.exited).toBe(0);
  expect(await new Response(child.stdout).text()).toBe("");
  expect(JSON.parse((await new Response(child.stderr).text()).trim())).toMatchObject({
    readonlyAudit: { blockedCalls: 3 },
  });
});
