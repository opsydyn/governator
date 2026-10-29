import { reportSemanticsValid } from "../../protocol/src/report-semantics.ts";
import validate from "./generated-validator.mjs";
import type { GovernanceReport } from "@governator/protocol";
export type ReportState =
  | { status: "ready"; report: GovernanceReport; source?: "snapshot" | "local-match" }
  | { status: "stale"; report: GovernanceReport; message: string }
  | { status: "empty" | "error" | "loading"; message: string };
type ReportObserver = (url: string | undefined, state: ReportState, verified: boolean) => void;
const observers = new Set<ReportObserver>();
export function subscribeReportObservations(observer: ReportObserver): () => void {
  observers.add(observer);
  return () => {
    observers.delete(observer);
  };
}
export function publishReportObservation(
  url: string | undefined,
  state: ReportState,
  verified = false,
): void {
  for (const observer of observers) observer(url, state, verified);
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
export async function verifyReportSource(
  state: ReportState,
  base: string,
  fetcher: ReportFetcher = (input, options) => fetch(input, options),
  signal?: AbortSignal,
  allowSnapshot = false,
): Promise<ReportState> {
  if (state.status !== "ready") return state;
  try {
    const url = new URL("/__governator/registry-source", base);
    url.searchParams.set("commit", state.report.commit);
    const response = await fetcher(url.href, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      ...(signal ? { signal } : {}),
    });
    if (
      allowSnapshot &&
      (response.status === 404 ||
        (response.ok && response.headers.get("content-type")?.includes("text/html")))
    )
      return { ...state, source: "snapshot" };
    if (response.ok) {
      const result: unknown = await response.json();
      if (
        result &&
        typeof result === "object" &&
        "snapshot" in result &&
        result.snapshot === true &&
        Object.keys(result).length === 1
      )
        return { ...state, source: "snapshot" };
      if (result && typeof result === "object" && "matches" in result && result.matches === true)
        return { ...state, source: "local-match" };
    }
  } catch {
    /* Source verification failed; fail closed. */
  }
  return {
    status: "error",
    message: "Report does not match this checkout. Regenerate the report, then retry.",
  };
}
export async function loadReport(
  url: string | undefined,
  base: string,
  now: number | (() => number) = Date.now,
  fetcher: ReportFetcher = (input, options) => fetch(input, options),
  signal?: AbortSignal,
  verifySource = false,
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
    const decoded = decodeReport(body, typeof now === "function" ? now() : now);
    return await verifyReportSource(decoded, base, fetcher, signal, !verifySource);
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
  if (state.status !== "ready") return state;
  const current = decodeReport(state.report);
  return current.status === "ready" ? state : current;
}

/** Recheck a local source on focus and periodically, failing closed on a hung request. */
export function watchReportSource(state: ReportState, invalidate: () => void): () => void {
  let active = true;
  let pending = false;
  let controller: AbortController | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    if (pending) return;
    pending = true;
    const request = new AbortController();
    controller = request;
    timeout = setTimeout(() => {
      if (active && !request.signal.aborted) {
        request.abort();
        pending = false;
        invalidate();
      }
    }, 10_000);
    void verifyReportSource(state, window.location.href, fetch, request.signal).then((result) => {
      if (active && !request.signal.aborted) {
        clearTimeout(timeout);
        pending = false;
        if (result.status !== "ready") invalidate();
      }
    });
  };
  window.addEventListener("focus", check);
  const interval = setInterval(check, 60_000);
  return () => {
    active = false;
    controller?.abort();
    clearTimeout(timeout);
    clearInterval(interval);
    window.removeEventListener("focus", check);
  };
}
