import { Ajv2020 } from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { decode, decodeReport, Report } from "../packages/core/src/domain.ts";
import { evaluate } from "../packages/core/src/evaluate.ts";
import { evaluation } from "./fixtures.ts";

test("v1 remains default, v2 projects exact sorted selected evidence without changing decisions", () => {
  const input = evaluation();
  input.evidence.push({ ...input.evidence[0]!, id: "aaa" });
  const v1 = evaluate(input);
  expect(evaluate(input, 1)).toEqual(v1);
  const v2 = evaluate(input, 2);
  expect(v2.schemaVersion).toBe(2);
  const check = v2.decisions[0]!.checks[0]!;
  expect(check.evidenceIds).toEqual(["aaa", "test-button"]);
  expect(check.evidence).toEqual(
    check.evidenceIds.map((id) => ({
      id,
      producer: "vitest",
      observedAt: input.evidence[0]!.observedAt,
      provenance: "demo",
    })),
  );
  expect(decodeReport(JSON.parse(JSON.stringify(v2)))).toEqual(v2);
  expect(() => decode(Report, v2)).toThrow();
  expect({
    ...v2,
    schemaVersion: 1,
    decisions: v2.decisions.map((d) => ({
      ...d,
      checks: d.checks.map(({ evidence: _, ...c }) => c),
    })),
  }).toEqual(v1);
});

for (const result of ["passed", "failed", "expired", "waived", "missing"] as const) {
  test(`v2 ${result} uses selected evidence only`, () => {
    const input: any = evaluation();
    if (result === "failed" || result === "waived") input.evidence[0].outcome = "failed";
    if (result === "expired") input.evidence[0].observedAt = "2026-10-24T11:00:00.000Z";
    if (result === "missing") input.evidence = [];
    if (result === "waived")
      input.waivers.push({
        schemaVersion: 1,
        id: "w",
        componentId: "ui.button",
        check: "unit-test",
        approver: "owner",
        reason: "exception",
        reference: "local",
        issuedAt: "2026-10-26T11:00:00.000Z",
        expiresAt: "2026-10-27T11:00:00.000Z",
        provenance: "demo",
      });
    input.evidence.push({ ...evaluation().evidence[0], id: "unrelated", componentId: "ui.other" });
    const check = evaluate(input, 2).decisions[0]!.checks[0]!;
    expect(check.result).toBe(result);
    expect(check.evidence.map((e) => e.id)).toEqual(check.evidenceIds);
    expect(check.evidenceIds).toEqual(result === "missing" ? [] : ["test-button"]);
  });
}

test("strict decoder rejects malformed, duplicate, missing, unreferenced and cross-check metadata", () => {
  const report = evaluate(evaluation(), 2);
  const mutations = [
    (r: any) => (r.schemaVersion = 3),
    (r: any) => (r.extra = true),
    (r: any) => (r.decisions[0].checks[0].evidence = []),
    (r: any) => r.decisions[0].checks[0].evidence.push(r.decisions[0].checks[0].evidence[0]),
    (r: any) => (r.decisions[0].checks[0].evidence[0].id = "other"),
    (r: any) => (r.decisions[0].checks[0].evidence[0].producer = ""),
    (r: any) => (r.decisions[0].checks[0].evidence[0].provenance = "trusted"),
    (r: any) => (r.decisions[0].checks[0].evidence[0].componentId = "ui.other"),
    (r: any) => (r.decisions[0].checks[0].evidence[0].observedAt = "2026-10-27T11:00:00.000Z"),
    (r: any) => (r.decisions[0].checks[0].evidence[0].observedAt = "2026-02-30T11:00:00.000Z"),
    (r: any) => r.decisions[0].checks.push(structuredClone(r.decisions[0].checks[0])),
  ];
  for (const mutate of mutations) {
    const r = structuredClone(report);
    mutate(r);
    expect(() => decodeReport(r)).toThrow();
  }
  expect(() => evaluate(evaluation(), 3 as any)).toThrow();
  const input = evaluation();
  input.evidence.push(input.evidence[0]!);
  expect(() => evaluate(input, 2)).toThrow();
});

test("v2 preserves optional source exactly and excludes mismatched source input", () => {
  const input = evaluation();
  const sourceUrl = "artifacts/unit-test.json";
  const report = evaluate(
    {
      ...input,
      evidence: [
        { ...input.evidence[0], sourceUrl },
        { ...input.evidence[0], id: "wrong-check", check: "documentation" },
        { ...input.evidence[0], id: "wrong-component", componentId: "ui.other" },
        { ...input.evidence[0], id: "future", observedAt: "2026-10-27T11:00:00.000Z" },
      ],
    },
    2,
  );
  expect(report.decisions[0]!.checks[0]!.evidence).toEqual([
    {
      id: "test-button",
      producer: "vitest",
      observedAt: input.evidence[0]!.observedAt,
      provenance: "demo",
      sourceUrl,
    },
  ]);
  expect(decodeReport(report)).toEqual(report);
});

test("v2 rejects reordered, duplicated and globally reused selected IDs", () => {
  const input = evaluation();
  input.evidence.push({ ...input.evidence[0]!, id: "aaa" });
  const report = evaluate(input, 2);
  const mutations = [
    (r: any) => r.decisions[0].checks[0].evidence.reverse(),
    (r: any) => {
      r.decisions[0].checks[0].evidence.reverse();
      r.decisions[0].checks[0].evidenceIds.reverse();
    },
    (r: any) => {
      r.decisions[0].checks[0].evidenceIds[1] = "aaa";
      r.decisions[0].checks[0].evidence[1].id = "aaa";
    },
    (r: any) => {
      const c = structuredClone(r.decisions[0].checks[0]);
      c.check = "documentation";
      r.decisions[0].checks.push(c);
    },
    (r: any) => {
      const d = structuredClone(r.decisions[0]);
      d.componentId = "ui.other";
      r.decisions.push(d);
    },
    (r: any) => r.decisions.push(structuredClone(r.decisions[0])),
    (r: any) => (r.evaluatedAt = "2026-02-30T11:00:00.000Z"),
    (r: any) => (r.decisions[0].checks[0].evidence[0].observedAt = "2026-10-26T11:00:00Z"),
  ];
  for (const mutate of mutations) {
    const r = structuredClone(report);
    mutate(r);
    expect(() => decodeReport(r)).toThrow();
  }
});

test("generated schemas preserve old-reader rejection and strict dual-version shapes", async () => {
  const ajv = new Ajv2020({ strict: false });
  const load = async (suffix: string) =>
    ajv.compile(
      JSON.parse(
        await readFile(
          new URL(`../packages/protocol/governance-report${suffix}.schema.json`, import.meta.url),
          "utf8",
        ),
      ),
    );
  const old = await load("");
  const v2 = await load("-v2");
  const both = await load("-versioned");
  const one = evaluate(evaluation());
  const two = evaluate(evaluation(), 2);
  expect(old(one)).toBe(true);
  expect(old(two)).toBe(false);
  expect(v2(one)).toBe(false);
  expect(v2(two)).toBe(true);
  expect(both(one)).toBe(true);
  expect(both(two)).toBe(true);
  expect(both({ ...two, schemaVersion: 3 })).toBe(false);
  const extra = structuredClone(two);
  Object.assign(extra.decisions[0]!.checks[0]!.evidence[0]!, { check: "documentation" });
  expect(both(extra)).toBe(false);
});
