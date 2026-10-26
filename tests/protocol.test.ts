import { describe, expect, test } from "vitest";
import { decode, Report } from "../packages/core/src/domain.ts";
import { evaluate } from "../packages/core/src/evaluate.ts";
import { evaluation } from "./fixtures.ts";
import { inspectBoundaries } from "../scripts/boundaries.ts";
describe("portable report contract", () => {
  test("report roundtrips as ordinary JSON and rejects unsupported versions", () => {
    const report = evaluate(evaluation());
    expect(decode(Report, JSON.parse(JSON.stringify(report)))).toEqual(report);
    expect(() => decode(Report, { ...report, schemaVersion: 2 })).toThrow();
  });
  test("boundary guard detects forbidden imports and runtime dependencies", () => {
    expect(
      inspectBoundaries({ dependencies: { effect: "4.0.6" } }, [
        'export type { Effect } from "effect";',
      ]),
    ).not.toEqual([]);
    expect(inspectBoundaries({}, ['import "node:fs";'])).not.toEqual([]);
    expect(inspectBoundaries({}, ["export interface Report { schemaVersion: 1 }"])).toEqual([]);
  });
});
