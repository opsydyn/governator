import { describe, expect, test } from "vitest";
import { importVitest, decodeTestMap } from "../packages/core/src/vitest.ts";
import { at, commit, registry } from "./fixtures.ts";
import { evaluate } from "../packages/core/src/evaluate.ts";
import { evaluation } from "./fixtures.ts";

const root = "/project";
const mapping = {
  schemaVersion: 1,
  mappings: [{ componentId: "ui.button", files: ["tests/button.test.ts"] }],
};
const start = Date.parse("2026-10-26T10:59:59.000Z");
const end = Date.parse("2026-10-26T11:00:00.000Z");
export function vitestReport(status = "passed") {
  return {
    numFailedTests: status === "failed" ? 1 : 0,
    numFailedTestSuites: status === "failed" ? 1 : 0,
    numPassedTests: status === "passed" ? 1 : 0,
    numPassedTestSuites: status === "failed" ? 0 : 1,
    numPendingTests: status === "skipped" ? 1 : 0,
    numPendingTestSuites: 0,
    numTodoTests: 0,
    numTotalTests: 1,
    numTotalTestSuites: 1,
    startTime: start,
    success: status !== "failed",
    testResults: [
      {
        name: "/project/tests/button.test.ts",
        status: status === "failed" ? "failed" : "passed",
        startTime: start,
        endTime: end,
        message: "",
        assertionResults: [
          {
            status,
            fullName: "Button interaction",
            title: "interaction",
            ancestorTitles: ["Button"],
            failureMessages: status === "failed" ? ["Expected enabled"] : [],
            duration: 1,
            meta: {},
            tags: [],
          },
        ],
      },
    ],
    snapshot: { failure: false, added: 0 },
    coverageMap: null,
  };
}
const options = () => ({ root, mapping, registry, commit, repository: "repo" });

describe("genuine Vitest report adapter", () => {
  test("maps actual assertion outcomes and derives observation time, without trusting imports", () => {
    const result = importVitest(vitestReport(), options());
    expect(result.evidence).toMatchObject([
      {
        componentId: "ui.button",
        check: "unit-test",
        outcome: "passed",
        producer: "vitest",
        provenance: "unverified",
        observedAt: "2026-10-26T11:00:00.000Z",
        repository: "repo",
        commit,
      },
    ]);
    expect(result.reportDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(
      evaluate({
        ...evaluation(),
        evidence: result.evidence,
        mode: "verified",
        repository: "repo",
        at,
      }).decisions[0]?.gate,
    ).toBe("insufficient_evidence");
  });
  test("a failed assertion or suite error is never converted to pass", () => {
    expect(importVitest(vitestReport("failed"), options()).evidence[0]?.outcome).toBe("failed");
    const report = vitestReport();
    report.success = false;
    report.numFailedTestSuites = 1;
    report.testResults[0]!.status = "failed";
    report.testResults[0]!.message = "beforeAll failed";
    expect(importVitest(report, options()).evidence[0]?.outcome).toBe("failed");
  });
  test("skipped-only, empty and missing mapped files leave missing proof", () => {
    expect(importVitest(vitestReport("skipped"), options()).evidence).toEqual([]);
    const empty = vitestReport();
    empty.numTotalTests = 0;
    empty.numPassedTests = 0;
    empty.testResults[0]!.assertionResults = [];
    expect(importVitest(empty, options()).evidence).toEqual([]);
    expect(
      importVitest(vitestReport(), {
        ...options(),
        mapping: {
          ...mapping,
          mappings: [{ componentId: "ui.button", files: ["tests/missing.test.ts"] }],
        },
      }).evidence,
    ).toEqual([]);
  });
  test("partial skip coverage cannot satisfy the whole component mapping", () => {
    const report = vitestReport();
    report.numTotalTests = 2;
    report.numPendingTests = 1;
    report.testResults[0]!.assertionResults.push({
      ...report.testResults[0]!.assertionResults[0]!,
      fullName: "Skipped keyboard",
      status: "skipped",
    });
    expect(importVitest(report, options()).evidence).toEqual([]);
  });
  test("normalizes only contained file paths and rejects duplicate file results", () => {
    const report = vitestReport();
    report.testResults.push(report.testResults[0]!);
    report.numTotalTests = 2;
    report.numPassedTests = 2;
    expect(() => importVitest(report, options())).toThrow(/duplicate/i);
    const outside = vitestReport();
    outside.testResults[0]!.name = "/project-other/tests/button.test.ts";
    expect(() => importVitest(outside, options())).toThrow(/outside|path/i);
  });
  test("rejects unknown components, duplicate mappings and unsafe mapping paths", () => {
    expect(() =>
      decodeTestMap(
        { ...mapping, mappings: [{ componentId: "ui.other", files: ["tests/button.test.ts"] }] },
        registry,
      ),
    ).toThrow();
    expect(() =>
      decodeTestMap({ ...mapping, mappings: [...mapping.mappings, ...mapping.mappings] }, registry),
    ).toThrow(/duplicate/i);
    expect(() =>
      decodeTestMap(
        { ...mapping, mappings: [{ componentId: "ui.button", files: ["../secret"] }] },
        registry,
      ),
    ).toThrow();
    expect(() =>
      decodeTestMap({ ...mapping, mappings: [{ componentId: "ui.button", files: [] }] }, registry),
    ).toThrow();
  });
  test("rejects malformed, contradictory and unrecognised execution outcomes", () => {
    expect(() => importVitest({ success: true }, options())).toThrow();
    expect(() => importVitest({ ...vitestReport(), numPassedTests: 3 }, options())).toThrow();
    expect(() => importVitest({ ...vitestReport("failed"), success: true }, options())).toThrow();
    expect(() => importVitest(vitestReport("unknown"), options())).toThrow();
    expect(() => importVitest({ ...vitestReport(), startTime: Infinity }, options())).toThrow();
  });
});
