import { afterEach, describe, expect, test, vi } from "vitest";
import { decodeReport, loadReport } from "../packages/storybook-addon/src/report.ts";
import { evaluate } from "../packages/core/src/index.ts";
import { evaluation, at } from "./fixtures.ts";
const now = Date.parse(at);
const report = () => evaluate(evaluation());
const release = () => ({
  gate: "blocked",
  status: "not_eligible",
  assurance: "unverified",
  baselineVersion: "8.4.1",
  candidateVersion: "8.4.2",
  baselineDigest: "sha256:baseline",
  candidateDigest: "sha256:candidate",
  sourceCommit: "a".repeat(40),
  evaluatedAt: at,
  inputDigest: "sha256:inputs",
  minimumBump: "major",
  declaredBump: "patch",
  candidateManifest: "artifacts/candidate/candidate.json",
  affectedComponents: ["ui.button"],
  reasons: ["Removed public tone prop requires major"],
  remediation: ["Declare and review a major migration"],
  publishable: false,
});
afterEach(() => vi.useRealTimers());
function fetchFixture(_url: string, options: RequestInit): Promise<Response> {
  expect(options.credentials).toBe("omit");
  expect(options.redirect).toBe("error");
  return Promise.resolve(new Response(JSON.stringify(report())));
}
describe("read-only addon report boundary", () => {
  test("renders optional exact-candidate release data without changing eligibility", () => {
    const candidate = release();
    const snapshot = { ...report(), release: candidate };
    expect(
      decodeReport({ ...snapshot, release: { ...candidate, sourceCommit: "b".repeat(40) } }, now)
        .status,
    ).toBe("error");
    expect(
      decodeReport(
        { ...snapshot, release: { ...candidate, evaluatedAt: "2026-10-20T12:00:00.000Z" } },
        now,
      ).status,
    ).toBe("error");
    expect(decodeReport(snapshot, now)).toMatchObject({
      status: "ready",
      report: { release: candidate },
    });
    expect(
      decodeReport({ ...snapshot, release: { ...candidate, publishable: true } }, now).status,
    ).toBe("error");
  });
  test("accepts the engine snapshot without recomputing or editing its decisions", () => {
    const result = decodeReport(report(), now);
    expect(result.status).toBe("ready");
    if (result.status === "ready") expect(result.report).toEqual(report());
  });
  test("rejects malformed, duplicate, unsupported and future reports", () => {
    expect(decodeReport({ schemaVersion: 1 }, now).status).toBe("error");
    expect(decodeReport({ ...report(), schemaVersion: 3 }, now)).toMatchObject({
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
  test("governance expires one millisecond after the 24-hour boundary", () => {
    expect(decodeReport(report(), now + 24 * 3_600_000).status).toBe("ready");
    expect(decodeReport(report(), now + 24 * 3_600_000 + 1).status).toBe("stale");
  });
  test("release expiry rejects the report with regeneration guidance", () => {
    const boundary = now + 24 * 3_600_000;
    const snapshot = {
      ...report(),
      evaluatedAt: new Date(boundary).toISOString(),
      release: release(),
    };
    expect(decodeReport(snapshot, boundary).status).toBe("ready");
    expect(decodeReport(snapshot, boundary + 1)).toMatchObject({
      status: "error",
      message: expect.stringMatching(/generat/i),
    });
  });
  test("validates a slow response after its body completes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now + 24 * 3_600_000);
    let finishBody!: (value: unknown) => void;
    const body = new Promise<unknown>((resolve) => {
      finishBody = resolve;
    });
    const response = new Response("{}");
    response.json = () => body;
    const pending = loadReport(
      "/report.json",
      "http://localhost:6006",
      undefined,
      async () => response,
    );
    await Promise.resolve();
    vi.setSystemTime(now + 24 * 3_600_000 + 1);
    finishBody(report());
    expect(await pending).toMatchObject({ status: "stale" });
  });
  test("an explicit numeric time remains fixed while loading", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now + 25 * 3_600_000);
    const result = await loadReport("/report.json", "http://localhost:6006", now, fetchFixture);
    expect(result.status).toBe("ready");
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

test("addon accepts strict v2 and rejects inconsistent evidence and observation times", () => {
  const snapshot = evaluate(evaluation(), 2);
  expect(decodeReport(snapshot, now).status).toBe("ready");
  for (const change of [
    (r: any) => r.decisions[0].checks[0].evidence.pop(),
    (r: any) => r.decisions[0].checks[0].evidence.push(r.decisions[0].checks[0].evidence[0]),
    (r: any) => (r.decisions[0].checks[0].evidence[0].observedAt = "2026-10-26T11:00:00Z"),
    (r: any) => (r.decisions[0].checks[0].evidence[0].id = "unselected"),
    (r: any) => (r.decisions[0].checks[0].evidence[0].observedAt = "2026-10-27T11:00:00.000Z"),
    (r: any) => (r.decisions[0].checks[0].evidence[0].observedAt = "2026-02-30T11:00:00.000Z"),
    (r: any) => (r.decisions[0].checks[0].evidence[0].unexpected = true),
  ]) {
    const invalid = structuredClone(snapshot);
    change(invalid);
    expect(decodeReport(invalid, now).status).toBe("error");
  }
});
