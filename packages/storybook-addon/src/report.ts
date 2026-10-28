import { reportSemanticsValid } from "../../protocol/src/report-semantics.ts";
import validate from "./generated-validator.mjs";
import type { GovernanceReport } from "@governator/protocol";
export type ReportState =
  | { status: "ready"; report: GovernanceReport }
  | { status: "stale"; report: GovernanceReport; message: string }
  | { status: "empty" | "error" | "loading"; message: string };
type ReportObserver = (url: string | undefined, state: ReportState) => void;
const observers = new Set<ReportObserver>();
export function subscribeReportObservations(observer: ReportObserver): () => void {
  observers.add(observer);
  return () => {
    observers.delete(observer);
  };
}
export function publishReportObservation(url: string | undefined, state: ReportState): void {
  for (const observer of observers) observer(url, state);
}
export function decodeReport(raw: unknown, now = Date.now()): ReportState {
  if (
    raw &&
    typeof raw === "object" &&
    "schemaVersion" in raw &&
    ![1, 2].includes(raw.schemaVersion as number)
  )
    return {
      status: "error",
      message: "Unsupported report format. This addon supports governance schemas 1 and 2.",
    };
  if (!validate(raw) || !reportSemanticsValid(raw))
    return {
      status: "error",
      message: "Malformed governance report. Generate a valid report with the CLI.",
    };
  if (new Set(raw.decisions.map((c) => c.componentId)).size !== raw.decisions.length)
    return {
      status: "error",
      message: "Malformed governance report: duplicate component identities.",
    };
  const time = Date.parse(raw.evaluatedAt);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString() !== raw.evaluatedAt ||
    time > now + 60_000
  )
    return { status: "error", message: "Invalid or future report evaluation time." };
  if (raw.release) {
    const evaluated = Date.parse(raw.release.evaluatedAt);
    if (
      raw.release.sourceCommit !== raw.commit ||
      !Number.isFinite(evaluated) ||
      new Date(evaluated).toISOString() !== raw.release.evaluatedAt ||
      evaluated > now + 60_000
    )
      return {
        status: "error",
        message: "Release candidate snapshot is invalid or belongs to another source.",
      };
    if (now - evaluated > 24 * 3_600_000)
      return {
        status: "error",
        message:
          "Unverified — release candidate snapshot is older than 24 hours. Generate a current release snapshot.",
      };
  }
  if (now - time > 24 * 3_600_000)
    return {
      status: "stale",
      report: raw,
      message: "Unverified — this report is older than 24 hours. Generate a current snapshot.",
    };
  return { status: "ready", report: raw };
}
export type ReportFetcher = (url: string, options: RequestInit) => Promise<Response>;
export async function loadReport(
  url: string | undefined,
  base: string,
  now: number | (() => number) = Date.now,
  fetcher: ReportFetcher = (input, options) => fetch(input, options),
  signal?: AbortSignal,
): Promise<ReportState> {
  if (!url)
    return {
      status: "empty",
      message:
        "Unverified — governance report not configured. Install the optional CLI to generate a report, then set parameters.governance.reportUrl.",
    };
  try {
    const resolved = new URL(url, base);
    const origin = new URL(base).origin;
    if (
      !["http:", "https:"].includes(resolved.protocol) ||
      resolved.origin !== origin ||
      resolved.username ||
      resolved.password
    )
      return {
        status: "error",
        message: "Governance reports must use a same-origin HTTP(S) URL without credentials.",
      };
    const response = await fetcher(resolved.href, {
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      ...(signal ? { signal } : {}),
    });
    if (!response.ok)
      return {
        status: "error",
        message: `Unverified — governance report unavailable (HTTP ${response.status}).`,
      };
    const body: unknown = await response.json();
    if (signal?.aborted) throw new Error("Report request aborted");
    return decodeReport(body, typeof now === "function" ? now() : now);
  } catch {
    return {
      status: "error",
      message:
        "Unverified — governance report could not be loaded or parsed. Check the report URL and JSON format.",
    };
  }
}

/** The first instant at which a validated observation is no longer current. */
export function reportExpiry(report: GovernanceReport): number {
  return (
    Math.min(
      Date.parse(report.evaluatedAt),
      report.release ? Date.parse(report.release.evaluatedAt) : Infinity,
    ) +
    24 * 3_600_000 +
    1
  );
}

export function revalidateReport(state: ReportState): ReportState {
  return state.status === "ready" ? decodeReport(state.report) : state;
}
