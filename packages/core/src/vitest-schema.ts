import { Schema, Result } from "effect";
import { ComponentId, GovernanceError } from "./domain.ts";

const text = Schema.String.check(Schema.isMinLength(1));
const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const epoch = Schema.Finite.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(8_640_000_000_000_000),
);
export const TestMap = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  mappings: Schema.NonEmptyArray(
    Schema.Struct({ componentId: ComponentId, files: Schema.NonEmptyArray(text) }),
  ),
});
export type TestMap = typeof TestMap.Type;
export const VitestReport = Schema.Struct({
  numFailedTests: count,
  numFailedTestSuites: count,
  numPassedTests: count,
  numPassedTestSuites: count,
  numPendingTests: count,
  numPendingTestSuites: count,
  numTodoTests: count,
  numTotalTests: count,
  numTotalTestSuites: count,
  startTime: epoch,
  success: Schema.Boolean,
  snapshot: Schema.Struct({ failure: Schema.Boolean }),
  testResults: Schema.Array(
    Schema.Struct({
      name: text,
      status: Schema.Literals(["passed", "failed"]),
      startTime: epoch,
      endTime: epoch,
      message: Schema.String,
      assertionResults: Schema.Array(
        Schema.Struct({
          status: Schema.Literals(["passed", "failed", "pending", "skipped", "todo", "disabled"]),
          fullName: text,
        }),
      ),
    }),
  ),
});
export type VitestReport = typeof VitestReport.Type;
/** Upstream reporter metadata is allowed; every semantic field we consume is validated. */
export function decodeVitestReport(raw: unknown): VitestReport {
  return Result.match(
    Schema.decodeUnknownResult(VitestReport, { onExcessProperty: "ignore" })(raw),
    {
      onSuccess: (value) => value,
      onFailure: (cause) => {
        throw new GovernanceError({ message: `Invalid Vitest 4 JSON report: ${String(cause)}` });
      },
    },
  );
}
