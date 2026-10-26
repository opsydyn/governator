import { describe, expect, test } from "vitest";
import { decodeReport, loadReport } from "../packages/storybook-addon/src/report.ts";
import { evaluate } from "../packages/core/src/index.ts";
import { evaluation, at } from "./fixtures.ts";
const now = Date.parse(at);
const report = () => evaluate(evaluation());
function fetchFixture(_url: string, options: RequestInit): Promise<Response> {
  expect(options.credentials).toBe("omit");
  expect(options.redirect).toBe("error");
  return Promise.resolve(new Response(JSON.stringify(report())));
}
describe("read-only addon report boundary", () => {
  test("accepts the engine snapshot without recomputing or editing its decisions", () => {
    const result = decodeReport(report(), now);
    expect(result.status).toBe("ready");
    if (result.status === "ready") expect(result.report).toEqual(report());
  });
  test("rejects malformed, duplicate, unsupported and future reports", () => {
    expect(decodeReport({ schemaVersion: 1 }, now).status).toBe("error");
    expect(decodeReport({ ...report(), schemaVersion: 2 }, now)).toMatchObject({
      status: "error",
      message: expect.stringMatching(/unsupported/i),
    });
    const snapshot = report();
    expect(
      decodeReport({ ...snapshot, decisions: [...snapshot.decisions, ...snapshot.decisions] }, now)
        .status,
    ).toBe("error");
    expect(decodeReport({ ...snapshot, evaluatedAt: "2099-01-01T00:00:00.000Z" }, now).status).toBe(
      "error",
    );
  });
  test("stale evidence never renders as current readiness", () => {
    expect(decodeReport(report(), now + 25 * 3_600_000)).toMatchObject({ status: "stale" });
  });
  test("no report configuration is an honest functional onboarding state", async () => {
    expect(await loadReport(undefined, "http://localhost:6006", now)).toMatchObject({
      status: "empty",
      message: expect.stringMatching(/unverified/i),
    });
  });
  test("fetch failure and malformed JSON are accessible report errors", async () => {
    expect(
      await loadReport(
        "/report.json",
        "http://localhost:6006",
        now,
        async () => new Response("missing", { status: 404 }),
      ),
    ).toMatchObject({ status: "error" });
    expect(
      await loadReport(
        "/report.json",
        "http://localhost:6006",
        now,
        async () => new Response("not json"),
      ),
    ).toMatchObject({ status: "error" });
  });
  test("never fetches credentials or follows cross-origin report URLs", async () => {
    expect(
      await loadReport("https://example.org/report.json", "http://localhost:6006", now),
    ).toMatchObject({ status: "error" });
    const result = await loadReport("/report.json", "http://localhost:6006", now, fetchFixture);
    expect(result.status).toBe("ready");
  });
});
