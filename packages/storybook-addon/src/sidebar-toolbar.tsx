/** @jsxRuntime classic */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useParameter, useStorybookApi, useStorybookState } from "storybook/manager-api";
import { WithTooltip } from "storybook/internal/components";
import { STORY_INDEX_INVALIDATED } from "storybook/internal/core-events";
import { useTheme } from "storybook/theming";
import {
  loadReport,
  publishReportObservation,
  reportExpiry,
  revalidateReport,
  subscribeReportObservations,
  watchReportSource,
} from "./report.ts";
import type { ReportState } from "./report.ts";
import { loadStoryMap, storiesByComponent } from "./story-navigation.ts";
import {
  createReadinessFilter,
  ReadinessFilterController,
  storyIndexSignature,
} from "./sidebar-filter.ts";
import type { ReadinessFilter } from "./sidebar-filter.ts";
import { publishSelectedReportStatus } from "./status-view.ts";

/** A separate manager tool keeps the sidebar selection alive when the panel is hidden. */
export function GovernanceSidebarFilter() {
  const api = useStorybookApi();
  const { index, refs } = useStorybookState();
  const params = useParameter<{ reportUrl?: unknown; registryEditor?: unknown }>("governance", {});
  const theme = useTheme();
  const url = typeof params.reportUrl === "string" ? params.reportUrl : undefined;
  const verifySource = params.registryEditor === true;
  const [mode, setMode] = useState<ReadinessFilter>("all");
  const [reportState, setReportState] = useState<{
    url: string | undefined;
    verified: boolean;
    state: ReportState;
  }>();
  const [map, setMap] = useState<{ signature: string; value: unknown }>();
  const [epoch, setEpoch] = useState(0);
  const [retry, setRetry] = useState(0);
  const [mapRetry, setMapRetry] = useState(0);
  const [error, setError] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpButton = useRef<HTMLButtonElement>(null);
  const helpId = useId();
  const helpHeadingId = useId();
  const signature = storyIndexSignature(index);
  const latestIndex = useRef(index);
  latestIndex.current = index;
  const generation = useRef(0);
  const reportGeneration = useRef(0);
  const composed = Object.keys(refs ?? {}).length > 0;
  const controller = useMemo(
    () =>
      new ReadinessFilterController((filter) =>
        api.experimental_setFilters({ "governator/readiness": filter }),
      ),
    [api],
  );
  const safety = useRef({ enabled: false, deadline: 0 });

  useEffect(() => {
    const invalidate = () => {
      reportGeneration.current++;
      safety.current.enabled = false;
      setReportState({
        url,
        verified: verifySource,
        state: { status: "error", message: "Registry changed; regenerate the report." },
      });
    };
    window.addEventListener("governator:registry-changed", invalidate);
    return () => window.removeEventListener("governator:registry-changed", invalidate);
  }, [url, verifySource]);

  useEffect(
    () =>
      subscribeReportObservations((observedUrl, state, verified) => {
        if (observedUrl === url && verified === verifySource) {
          reportGeneration.current++;
          if (state.status !== "ready") safety.current.enabled = false;
          setReportState({ url, verified: verifySource, state: revalidateReport(state) });
        }
      }),
    [url, verifySource],
  );

  useEffect(
    () =>
      api.on(STORY_INDEX_INVALIDATED, () => {
        generation.current++;
        safety.current.enabled = false;
        setMap(undefined);
        setMode("all");
        setEpoch((value) => value + 1);
      }),
    [api],
  );
  useEffect(() => {
    const request = ++generation.current;
    const controller = new AbortController();
    setMap(undefined);
    if (signature)
      void loadStoryMap(document.baseURI, window.location.origin, fetch, controller.signal).then(
        (value) => {
          if (!controller.signal.aborted && request === generation.current && value !== undefined)
            setMap({ signature, value });
        },
      );
    return () => controller.abort();
  }, [signature, epoch, mapRetry]);
  useEffect(() => {
    const controller = new AbortController();
    const request = ++reportGeneration.current;
    setMode("all");
    setReportState({
      url,
      verified: verifySource,
      state: { status: "loading", message: "Loading governance report." },
    });
    const timer = setTimeout(() => {
      controller.abort();
      if (reportGeneration.current === request) {
        const state = { status: "error" as const, message: "Report request timed out." };
        setReportState({ url, verified: verifySource, state });
        publishReportObservation(url, state, verifySource);
      }
    }, 10_000);
    void loadReport(
      url,
      window.location.href,
      Date.now,
      fetch,
      controller.signal,
      verifySource,
    ).then((state) => {
      if (!controller.signal.aborted && reportGeneration.current === request) {
        const next = revalidateReport(state);
        setReportState({ url, verified: verifySource, state: next });
        publishReportObservation(url, next, verifySource);
      }
      clearTimeout(timer);
    });
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [url, retry, verifySource]);
  useEffect(() => {
    if (reportState?.state.status !== "error") return;
    const refresh = () => setRetry((value) => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [reportState]);
  useEffect(() => {
    if (reportState?.state.status !== "ready") return;
    const check = () =>
      setReportState((current) => {
        if (!current) return current;
        const state = revalidateReport(current.state);
        return state === current.state ? current : { ...current, state };
      });
    const timer = setTimeout(
      check,
      Math.min(Math.max(0, reportExpiry(reportState.state.report) - Date.now()), 2_147_483_647),
    );
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [reportState]);
  useEffect(() => {
    if (reportState?.state.status !== "ready" || reportState.state.source !== "local-match") return;
    return watchReportSource(reportState.state, () => {
      safety.current.enabled = false;
      window.dispatchEvent(new Event("governator:registry-changed"));
    });
  }, [reportState, verifySource]);
  const current =
    reportState && reportState.url === url && reportState.verified === verifySource
      ? revalidateReport(reportState.state)
      : undefined;
  const report = current?.status === "ready" ? current.report : undefined;
  const mapped =
    map?.signature === signature &&
    index &&
    Object.keys(storiesByComponent(index, map.value)).length > 0
      ? map.value
      : undefined;
  const available = !!report && !!mapped && !composed && !error;
  useEffect(() => {
    publishSelectedReportStatus({
      reportUrl: url,
      verifySource,
      report: available ? report : undefined,
      index,
      mapping: available ? mapped : undefined,
    });
  }, [url, verifySource, report, index, mapped, available]);
  safety.current = { enabled: available, deadline: report ? reportExpiry(report) : 0 };
  useEffect(() => {
    if (!available) setMode("all");
    const filter =
      available && report && latestIndex.current
        ? createReadinessFilter(mode, latestIndex.current, mapped, report.decisions)
        : () => true;
    void controller
      .set(
        (item) => !safety.current.enabled || Date.now() >= safety.current.deadline || filter(item),
      )
      .catch(() => {
        safety.current.enabled = false;
        setError(true);
        void controller.set(() => true).catch(() => {});
      });
  }, [controller, mode, available, report, mapped, signature]);
  useEffect(
    () => () => {
      safety.current.enabled = false;
      void controller.set(() => true).catch(() => {});
    },
    [controller],
  );
  useEffect(() => {
    if (!helpOpen) return;
    const restoreFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTimeout(() => helpButton.current?.focus(), 0);
    };
    document.addEventListener("keydown", restoreFocus, true);
    return () => document.removeEventListener("keydown", restoreFocus, true);
  }, [helpOpen]);
  const reason = composed
    ? "Unavailable when composed Storybooks are present."
    : error
      ? "Sidebar filtering is unavailable."
      : !report
        ? current && "message" in current
          ? current.message
          : "Select a story with a current governance report."
        : !mapped
          ? "Story mapping unavailable. Restart Storybook, then retry."
          : "Filters against the selected report. Unmapped stories remain visible.";
  return (
    <div
      title={reason}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "0 5px",
        font: "600 11px ui-monospace, monospace",
        color: theme.color.defaultText,
      }}
    >
      <span style={{ color: theme.base === "dark" ? "#ff9fac" : "#98001d" }}>G</span>
      <select
        aria-label="Filter sidebar by readiness"
        aria-description={reason}
        disabled={!available}
        value={available ? mode : "all"}
        onChange={(event) => setMode(event.currentTarget.value as ReadinessFilter)}
        style={{
          color: theme.color.defaultText,
          background: theme.background.content,
          border: "1px solid currentColor",
          borderRadius: 2,
          padding: "4px",
          maxWidth: 160,
        }}
      >
        <option value="all">All readiness</option>
        <option value="attention">Needs attention</option>
        <option value="blocked">Blocked</option>
        <option value="insufficient_evidence">Missing evidence</option>
        <option value="ready">Ready</option>
      </select>
      {!available && (
        <WithTooltip
          trigger="click"
          placement="bottom-end"
          closeOnOutsideClick
          interactive
          hasChrome
          onVisibleChange={setHelpOpen}
          tooltip={({ onHide }) => (
            <div
              id={helpId}
              role="dialog"
              aria-labelledby={helpHeadingId}
              style={{ width: 260, padding: 10, whiteSpace: "normal", lineHeight: 1.4 }}
            >
              <strong id={helpHeadingId} style={{ display: "block", marginBottom: 4 }}>
                Readiness unavailable
              </strong>
              <span>{reason}</span>
              {!composed && (
                <button
                  type="button"
                  aria-label="Retry readiness filter"
                  autoFocus
                  onClick={() => {
                    onHide();
                    setError(false);
                    setMapRetry((value) => value + 1);
                    setRetry((value) => value + 1);
                  }}
                  style={{ display: "block", marginTop: 8 }}
                >
                  Retry
                </button>
              )}
            </div>
          )}
        >
          <button
            ref={helpButton}
            type="button"
            aria-label="Readiness filter help"
            aria-expanded={helpOpen}
            aria-haspopup="dialog"
            aria-controls={helpOpen ? helpId : undefined}
          >
            Status
          </button>
        </WithTooltip>
      )}
    </div>
  );
}
