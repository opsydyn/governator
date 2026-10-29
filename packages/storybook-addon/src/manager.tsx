/** @jsxRuntime classic */
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  if (!source || !URL.canParse(source)) return undefined;
  const url = new URL(source);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
    ? url.href
    : undefined;
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
  const color = (gate: string) =>
    gate === "ready"
      ? theme.base === "dark"
        ? "#83dca8"
        : "#16633b"
      : gate === "blocked"
        ? theme.base === "dark"
          ? "#ffb09f"
          : "#a82f24"
        : theme.base === "dark"
          ? "#f2cf7f"
          : "#855800";
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
        <>
          <div className="gn-split">
            <div className="gn-card">
              <h3>Versioned contracts</h3>
              <div>
                Component contract <strong>{component.contractVersion}</strong>
              </div>
              <div>
                Package{" "}
                <code>
                  {component.package}@{component.packageVersion ?? "unknown"}
                </code>
              </div>
              <p className="gn-small">
                Component versions describe compatibility. The shared package is the installable
                unit.
              </p>
            </div>
            <div className="gn-card">
              <h3>Snapshot provenance</h3>
              <div>
                Policy <code>{report.policyVersion}</code> · {report.assurance}
              </div>
              <div className="gn-small">
                Source {report.commit.slice(0, 12)} ·{" "}
                {new Date(report.evaluatedAt).toLocaleString()}
              </div>
              <p className="gn-small">
                Publication {report.publication} · Deployment {report.deployment} · Adoption{" "}
                {report.adoption}
              </p>
            </div>
          </div>
          {report.release && (
            <div className="gn-card gn-note">
              <h3 style={{ color: color(report.release.gate) }}>
                Exact release candidate: {report.release.gate.replaceAll("_", " ")}
              </h3>
              <p>
                Changeset <strong>{report.release.declaredBump}</strong> · required{" "}
                <strong>{report.release.minimumBump}</strong> · {report.release.baselineVersion} →{" "}
                {report.release.candidateVersion}
              </p>
              <p className="gn-small">
                {report.release.status.replaceAll("_", " ")} · {report.release.assurance} ·
                publication authorization unavailable
              </p>
              <ul>
                {report.release.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <details>
                <summary>Candidate integrity and remediation</summary>
                <p className="gn-small">
                  Artifact {report.release.candidateDigest}
                  <br />
                  Source {report.release.sourceCommit}
                  <br />
                  Candidate manifest {report.release.candidateManifest}
                </p>
                <ul>
                  {report.release.remediation.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            </div>
          )}
          {compatibility && (
            <div className="gn-card">
              <h3 style={{ color: color(compatibility.gate) }}>
                API compatibility: {compatibility.gate.replaceAll("_", " ")}
              </h3>
              <div>
                Local baseline {compatibility.baselineVersion} → candidate{" "}
                {compatibility.candidateVersion} · minimum bump{" "}
                <strong>{compatibility.minimumBump}</strong>
              </div>
              <div className="gn-small">
                Contract {compatibility.baselineContractVersion} → {component.contractVersion}
              </div>
              <ul>
                {[...compatibility.changes, ...compatibility.reasons].map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
              <details>
                <summary>Scope and baseline digest</summary>
                <p className="gn-small">{compatibility.baselineDigest}</p>
                <ul>
                  {compatibility.limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            </div>
          )}
          <div className="gn-card">
            <h3>Evidence and next actions</h3>
            <p className="gn-small">
              Producer and provenance are reported information, not authentication. Evidence age is
              measured at report evaluation, not live freshness.
            </p>
            <div className="gn-table-wrap">
              <table className="gn-table">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Result</th>
                    <th>Evidence</th>
                    <th>Reason / next action</th>
                  </tr>
                </thead>
                <tbody>
                  {component.checks.map((check) => (
                    <tr key={check.check}>
                      <td>{check.check}</td>
                      <td>{check.result}</td>
                      <td>
                        {check.evidenceIds.length
                          ? check.evidenceIds.map((id) => (
                              <div key={id}>
                                <code>{id}</code>
                                {(() => {
                                  const evidence =
                                    report.schemaVersion === 2
                                      ? report.decisions
                                          .find(
                                            (item) => item.componentId === component.componentId,
                                          )
                                          ?.checks.find((item) => item.check === check.check)
                                          ?.evidence.find((item) => item.id === id)
                                      : undefined;
                                  const href = sourceHref(evidence?.sourceUrl);
                                  return (
                                    <div className="gn-small">
                                      <div>
                                        Producer (reported): {evidence?.producer ?? "unknown"}
                                      </div>
                                      <div>
                                        Provenance (reported): {evidence?.provenance ?? "unknown"}
                                      </div>
                                      <div>
                                        Observed:{" "}
                                        {evidence ? (
                                          <time dateTime={evidence.observedAt}>
                                            {evidence.observedAt}
                                          </time>
                                        ) : (
                                          "unknown"
                                        )}
                                      </div>
                                      <div data-evidence-age>
                                        Age at evaluation:{" "}
                                        {evidence
                                          ? `${Math.floor((Date.parse(report.evaluatedAt) - Date.parse(evidence.observedAt)) / 1000)} seconds`
                                          : "unknown"}
                                      </div>
                                      <div>
                                        Source:{" "}
                                        {href ? (
                                          <a href={href}>{evidence?.sourceUrl}</a>
                                        ) : (
                                          (evidence?.sourceUrl ?? "unknown")
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            ))
                          : "None"}
                      </td>
                      <td>{check.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {component.reasons.length > 0 && (
              <ul>
                {component.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            <p className="gn-small">
              Active waivers:{" "}
              {component.activeWaivers.length ? component.activeWaivers.join(", ") : "none"}
            </p>
          </div>
          <p className="gn-small gn-note">
            Readiness, API compatibility, publication and deployment are independent. This snapshot
            does not grant human approval or prove production use.
          </p>
        </>
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
  const gateColors =
    gate?.tone === "success"
      ? ["#174d32", "#e3ffeb"]
      : gate?.tone === "danger"
        ? ["#751e2d", "#fff2f2"]
        : ["#654300", "#fff4d5"];
  return (
    <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
      <span>{label}</span>
      <small
        title={title}
        aria-label={title}
        style={{
          fontSize: 11,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          lineHeight: 1.4,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        {component ? (
          <>
            <span style={{ border: "1px solid currentColor", borderRadius: 3, padding: "1px 4px" }}>
              {component.lifecycle.charAt(0).toUpperCase() + component.lifecycle.slice(1)}
            </span>
            <span
              data-governator-gate={component.gate}
              style={{
                backgroundColor: gateColors[0],
                color: gateColors[1],
                borderRadius: 3,
                padding: "1px 5px",
                fontWeight: 700,
              }}
            >
              {gate?.label}
            </span>
          </>
        ) : (
          <span style={{ border: "1px solid currentColor", borderRadius: 3, padding: "1px 4px" }}>
            {status.kind === "mixed" ? "Mixed" : "Unknown"}
          </span>
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
