/** @jsxRuntime classic */
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { GovernanceReport } from "@governator/protocol";
import type { HashEntry } from "storybook/manager-api";
import {
  addons,
  types,
  useParameter,
  useStorybookApi,
  useStorybookState,
} from "storybook/manager-api";
import { loadStoryMap, storiesByComponent } from "./story-navigation.ts";
import { STORY_INDEX_INVALIDATED } from "storybook/internal/core-events";
import { AddonPanel } from "storybook/internal/components";
import { useTheme } from "storybook/theming";
import {
  loadReport,
  publishReportObservation,
  reportExpiry,
  revalidateReport,
  watchReportSource,
} from "./report.ts";
import type { ReportState } from "./report.ts";
import type { TagDraft } from "./tag-editor-ui.tsx";
import { TagEditor } from "./tag-editor-ui.tsx";
import { RegistryEditor } from "./registry-editor-ui.tsx";
import { Discovery } from "./discovery.tsx";
import { GovernanceSidebarFilter } from "./sidebar-toolbar.tsx";
import { governatorLogo } from "./logo.ts";
import {
  readinessView,
  selectedReportStatus,
  sidebarStatus,
  subscribeSelectedReportStatus,
} from "./status-view.ts";
import { PanelSummary } from "./panel-summary.tsx";
import "./manager.css";

// Storybook may unmount the panel while the manager stays open.
const tagDrafts = new Map<string, TagDraft>();

type DetailedEvidence = Extract<
  GovernanceReport,
  { schemaVersion: 2 }
>["decisions"][number]["checks"][number]["evidence"][number];

function evidenceFor(
  report: GovernanceReport,
  componentId: string,
  checkName: string,
): readonly DetailedEvidence[] {
  if (report.schemaVersion !== 2) return [];
  return (
    report.decisions
      .find((decision) => decision.componentId === componentId)
      ?.checks.find((check) => check.check === checkName)?.evidence ?? []
  );
}

function useFreshness(
  state: ReportState,
  setState: React.Dispatch<React.SetStateAction<ReportState>>,
  monitorSource = false,
) {
  useEffect(() => {
    if (state.status !== "ready") return;
    const revalidate = () => setState((current) => revalidateReport(current));
    const delay = Math.max(0, reportExpiry(state.report) - Date.now());
    const timer = setTimeout(revalidate, Math.min(delay, 2_147_483_647));
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [state, setState]);
  useEffect(() => {
    if (!monitorSource || state.status !== "ready" || state.source !== "local-match") return;
    return watchReportSource(state, () =>
      window.dispatchEvent(new Event("governator:registry-changed")),
    );
  }, [state, monitorSource]);
}

function sourceHref(source: string | undefined): string | undefined {
  if (!source || !URL.canParse(source)) return;
  const url = new URL(source);
  if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url.href;
}

function CopyId({ id }: { id: string }) {
  const [feedback, setFeedback] = useState("");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const copy = () => {
    const request = ++generation.current;
    setFeedback("");
    void Promise.resolve()
      .then(() => {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        return navigator.clipboard.writeText(id);
      })
      .then(
        () => {
          if (request === generation.current) setFeedback("Copied ID");
        },
        () => {
          if (request === generation.current)
            setFeedback("Copy failed. Check clipboard permissions.");
        },
      );
  };
  return (
    <>
      <button onClick={copy}>{feedback === "Copied ID" ? feedback : "Copy ID"}</button>{" "}
      <span role="status" aria-live="polite">
        {feedback === "Copied ID" ? "ID copied." : feedback}
      </span>
    </>
  );
}
class FocusRecovery extends React.Component<{
  style: React.CSSProperties;
  mode: string;
  children: React.ReactNode;
}> {
  panel = React.createRef<HTMLElement>();
  getSnapshotBeforeUpdate() {
    const focused = document.activeElement;
    return focused && this.panel.current?.contains(focused) ? focused : null;
  }
  componentDidUpdate(_previous: unknown, _state: unknown, focused: Element | null) {
    if (focused && !focused.isConnected && document.activeElement === document.body)
      this.panel.current?.querySelector<HTMLButtonElement>("[data-reload]")?.focus();
  }
  render() {
    return (
      <section
        ref={this.panel}
        className="gn-panel"
        data-gn-theme={this.props.mode}
        style={this.props.style}
      >
        {this.props.children}
      </section>
    );
  }
}
function Panel() {
  const theme = useTheme();
  const { storyId, index } = useStorybookState();
  const api = useStorybookApi();
  const tagEditsPending = useRef(false);
  const registryEditsPending = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const setTagEditsPending = useCallback((dirty: boolean) => {
    tagEditsPending.current = dirty;
  }, []);
  const setRegistryEditsPending = useCallback((dirty: boolean) => {
    registryEditsPending.current = dirty;
  }, []);
  const mappingGeneration = useRef(0);
  const [storyMap, setStoryMap] = useState<{ index: typeof index; value: unknown }>();
  useEffect(
    () =>
      api.on(STORY_INDEX_INVALIDATED, () => {
        mappingGeneration.current++;
        setStoryMap(undefined);
      }),
    [api],
  );
  useEffect(() => {
    const generation = ++mappingGeneration.current;
    const controller = new AbortController();
    setStoryMap(undefined);
    if (index)
      void loadStoryMap(document.baseURI, window.location.origin, fetch, controller.signal).then(
        (value) => {
          if (
            !controller.signal.aborted &&
            generation === mappingGeneration.current &&
            value !== undefined
          )
            setStoryMap({ index, value });
        },
      );
    return () => controller.abort();
  }, [index]);
  const params = useParameter<{
    componentId?: unknown;
    reportUrl?: unknown;
    registryEditor?: unknown;
  }>("governance", {});
  const componentId = typeof params.componentId === "string" ? params.componentId : undefined;
  const verifySource = params.registryEditor === true;
  const reportUrl = typeof params.reportUrl === "string" ? params.reportUrl : undefined;
  const [state, setState] = useState<ReportState>({
    status: "loading",
    message: "Loading governance snapshot…",
  });
  const [refresh, setRefresh] = useState(0);
  const [stateKey, setStateKey] = useState({
    url: params.reportUrl,
    refresh,
    verified: verifySource,
  });
  useFreshness(state, setState, true);
  const currentState: ReportState =
    stateKey.url === params.reportUrl &&
    stateKey.refresh === refresh &&
    stateKey.verified === verifySource
      ? revalidateReport(state)
      : { status: "loading", message: "Loading governance snapshot…" };
  useEffect(() => {
    let active = true;
    setStateKey({ url: params.reportUrl, refresh, verified: verifySource });
    const controller = new AbortController();
    const invalidate = () => {
      active = false;
      controller.abort();
      const changed: ReportState = {
        status: "error",
        message: "Registry changed; commit it and regenerate the report.",
      };
      setState(changed);
      publishReportObservation(reportUrl, changed, verifySource);
    };
    window.addEventListener("governator:registry-changed", invalidate);
    const timeout = setTimeout(() => {
      controller.abort();
      if (active) {
        const timedOut: ReportState = {
          status: "error",
          message: "Unverified — governance report request timed out. Reload the report.",
        };
        setState(timedOut);
        publishReportObservation(reportUrl, timedOut, verifySource);
      }
    }, 10_000);
    if (params.reportUrl !== undefined && typeof params.reportUrl !== "string") {
      setState({ status: "error", message: "Governance reportUrl must be a string." });
      clearTimeout(timeout);
      return () => {
        controller.abort();
        window.removeEventListener("governator:registry-changed", invalidate);
      };
    }
    const loading: ReportState = { status: "loading", message: "Loading governance snapshot…" };
    setState(loading);
    publishReportObservation(reportUrl, loading, verifySource);
    void loadReport(
      reportUrl,
      window.location.href,
      Date.now,
      fetch,
      controller.signal,
      verifySource,
    ).then((result) => {
      if (active && !controller.signal.aborted) {
        const next = revalidateReport(result);
        setState(next);
        publishReportObservation(reportUrl, next, verifySource);
      }
      clearTimeout(timeout);
    });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
      window.removeEventListener("governator:registry-changed", invalidate);
    };
  }, [reportUrl, refresh, params.reportUrl, verifySource]);
  const report = currentState.status === "ready" ? currentState.report : undefined;
  const component = report?.decisions.find((item) => item.componentId === componentId);
  const compatibility = component?.compatibility;
  return (
    <FocusRecovery
      mode={theme.base}
      style={{ color: theme.color.defaultText, background: theme.background.content }}
    >
      <div className="gn-brand" aria-label="Governator design system governance">
        <img className="gn-brand-mark" src={governatorLogo} data-governator-logo alt="" />
        <span>
          <strong>GOVERNATOR</strong>
          <small>DESIGN SYSTEM GOVERNANCE</small>
        </span>
      </div>
      <PanelSummary
        component={component}
        componentId={componentId}
        mode={verifySource ? "local-editing" : "read-only"}
        headingRef={headingRef}
      />
      <div className="gn-actions">
        {component && <CopyId key={component.componentId} id={component.componentId} />}
        <button data-reload onClick={() => setRefresh((value) => value + 1)}>
          Reload report
        </button>
      </div>
      <div role="status" aria-live="polite" className={report ? "gn-small" : "gn-card gn-note"}>
        {currentState.status !== "ready"
          ? currentState.message
          : component
            ? "Governance report snapshot loaded."
            : componentId
              ? `No registry decision for ${componentId}.`
              : "Link this story with parameters.governance.componentId."}
      </div>
      {report && (
        <Discovery
          decisions={report.decisions}
          stories={storiesByComponent(
            index,
            storyMap && storyMap.index === index ? storyMap.value : undefined,
          )}
          selectStory={(id) => {
            if (id !== storyId && (tagEditsPending.current || registryEditsPending.current))
              return {
                blockedBy:
                  tagEditsPending.current && registryEditsPending.current
                    ? "both"
                    : tagEditsPending.current
                      ? "tags"
                      : "metadata",
              };
            api.selectStory(id);
            return true;
          }}
          focusDestination={() =>
            requestAnimationFrame(() => {
              headingRef.current?.focus();
              headingRef.current?.scrollIntoView({ block: "nearest" });
            })
          }
        />
      )}
      {storyId && (
        <details className="gn-authoring gn-card" open={verifySource || undefined}>
          <summary>{verifySource ? "Edit story governance" : "Story governance metadata"}</summary>
          <TagEditor
            key={storyId}
            storyId={storyId}
            onDirtyChange={setTagEditsPending}
            drafts={tagDrafts}
          />
          {verifySource && componentId && (
            <RegistryEditor
              key={`${storyId}:${componentId}`}
              storyId={storyId}
              componentId={componentId}
              onDirtyChange={setRegistryEditsPending}
            />
          )}
        </details>
      )}
      {!report ? (
        <p className="gn-small">
          A report is optional. This panel never grants approval or infers production deployment.
        </p>
      ) : component ? (
        <details className="gn-card gn-diagnostics">
          <summary>Technical report details</summary>
          <p>
            Contract <strong>{component.contractVersion}</strong> · package{" "}
            <code>
              {component.package}@{component.packageVersion ?? "unknown"}
            </code>
          </p>
          <p className="gn-small">
            Policy {report.policyVersion} · {report.assurance} · source {report.commit.slice(0, 12)}{" "}
            · {new Date(report.evaluatedAt).toLocaleString()}
            <br />
            Publication {report.publication} · deployment {report.deployment} · adoption{" "}
            {report.adoption}
          </p>
          {report.release && (
            <p className={`gn-status-text gn-status-${report.release.gate}`}>
              <strong>Release candidate: {report.release.gate.replaceAll("_", " ")}</strong> ·{" "}
              {report.release.baselineVersion} → {report.release.candidateVersion} · declared{" "}
              {report.release.declaredBump}, required {report.release.minimumBump}.{" "}
              {[...report.release.reasons, ...report.release.remediation].join(" ")}
            </p>
          )}
          {compatibility && (
            <p className={`gn-status-text gn-status-${compatibility.gate}`}>
              <strong>API compatibility: {compatibility.gate.replaceAll("_", " ")}</strong> ·{" "}
              {compatibility.baselineVersion} → {compatibility.candidateVersion} · minimum bump{" "}
              {compatibility.minimumBump}.{" "}
              {[
                ...compatibility.changes,
                ...compatibility.reasons,
                ...compatibility.limitations,
              ].join(" ")}
            </p>
          )}
          <p className="gn-small">
            Producer and provenance are reported, not authenticated. Evidence age is fixed at report
            evaluation.
          </p>
          <ul>
            {component.checks.map((check) => (
              <li key={check.check}>
                <strong>
                  {check.check}: {check.result}
                </strong>{" "}
                — {check.reason}
                <div className="gn-small">Evidence: {check.evidenceIds.join(", ") || "None"}</div>
                {report.schemaVersion === 2 ? (
                  evidenceFor(report, component.componentId, check.check).map((evidence) => {
                    const href = sourceHref(evidence.sourceUrl);
                    return (
                      <details className="gn-small" key={evidence.id}>
                        <summary>{evidence.id} details</summary>
                        <div>Producer (reported): {evidence.producer}</div>
                        <div>Provenance (reported): {evidence.provenance}</div>
                        <div>Observed: {evidence.observedAt}</div>
                        <div data-evidence-age>
                          Age at evaluation:{" "}
                          {Math.floor(
                            (Date.parse(report.evaluatedAt) - Date.parse(evidence.observedAt)) /
                              1000,
                          )}{" "}
                          seconds
                        </div>
                        <div>
                          Source:{" "}
                          {href ? (
                            <a href={href}>{evidence.sourceUrl}</a>
                          ) : (
                            (evidence.sourceUrl ?? "unknown")
                          )}
                        </div>
                      </details>
                    );
                  })
                ) : (
                  <div className="gn-small">Producer (reported): unknown · Source: unknown</div>
                )}
              </li>
            ))}
          </ul>
          <p className="gn-small">
            Reasons: {component.reasons.join(" ") || "none"} · active waivers:{" "}
            {component.activeWaivers.join(", ") || "none"}
          </p>
          <p className="gn-small gn-note">
            Readiness, API compatibility, publication and deployment are independent. This snapshot
            does not grant human approval or prove production use.
          </p>
        </details>
      ) : null}
    </FocusRecovery>
  );
}
function SidebarLabel({ item, label }: { item: HashEntry; label: React.ReactNode }) {
  const [selected, setSelected] = useState(selectedReportStatus());
  useEffect(() => subscribeSelectedReportStatus(setSelected), []);
  const status = selected ? sidebarStatus(item, selected) : { kind: "unknown" as const };
  const component = status.kind === "decision" ? status.decision : undefined;
  const gate = component ? readinessView(component.gate) : undefined;
  const title = component
    ? `Selected report. Lifecycle: ${component.lifecycle}; readiness: ${gate?.label}. ${gate?.description}`
    : status.kind === "mixed"
      ? "Selected report has multiple component identities below this item."
      : "Selected report has no verified component identity for this item.";
  return (
    <span className="gn-sidebar-label">
      <span>{label}</span>
      <small className="gn-sidebar-status" title={title} aria-label={title}>
        {component ? (
          <>
            <span className="gn-sidebar-pill">
              {component.lifecycle.charAt(0).toUpperCase() + component.lifecycle.slice(1)}
            </span>
            <span className="gn-sidebar-pill gn-sidebar-gate" data-governator-gate={component.gate}>
              {gate?.label}
            </span>
          </>
        ) : (
          <span className="gn-sidebar-pill">{status.kind === "mixed" ? "Mixed" : "Unknown"}</span>
        )}
      </small>
    </span>
  );
}
addons.register("governator", () => {
  const previous = addons.getConfig().sidebar;
  addons.setConfig({
    sidebar: {
      ...previous,
      renderLabel: (item, api) => {
        const label = previous?.renderLabel ? previous.renderLabel(item, api) : item.name;
        return ["story", "docs", "component"].includes(item.type) ? (
          <SidebarLabel item={item} label={label} />
        ) : (
          label
        );
      },
    },
  });
  addons.add("governator/readiness-toolbar", {
    title: "Governator readiness filter",
    type: types.TOOL,
    render: () => <GovernanceSidebarFilter />,
  });
  addons.add("governator/governance", {
    title: "Governance",
    type: types.PANEL,
    render: ({ active }) => (
      <AddonPanel active={!!active}>
        <Panel />
      </AddonPanel>
    ),
  });
});
