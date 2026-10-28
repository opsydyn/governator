/** @jsxRuntime classic */
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { API, HashEntry } from "storybook/manager-api";
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
import { TagEditor } from "./tag-editor-ui.tsx";
import { RegistryEditor } from "./registry-editor-ui.tsx";
import type { TagDraft } from "./tag-editor-ui.tsx";
import { Discovery } from "./discovery.tsx";
import { GovernanceSidebarFilter } from "./sidebar-toolbar.tsx";
import { brandCss } from "./brand.ts";

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

const css = `.gn-panel{font:13px/1.5 ui-sans-serif,system-ui,sans-serif;padding:22px 26px;min-height:250px}.gn-panel *{box-sizing:border-box}.gn-panel h2{font-size:20px;letter-spacing:-.4px;margin:0}.gn-panel h3{font-size:13px;margin:0 0 9px}.gn-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.gn-small{font-size:11px;opacity:.72}.gn-chips{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:10px 0}.gn-chip{border:1px solid currentColor;border-radius:5px;padding:2px 8px;font-size:11px;font-weight:650}.gn-card{padding:15px 17px;margin-bottom:14px}.gn-split{display:grid;grid-template-columns:1fr 1fr;gap:12px}.gn-table{border-collapse:collapse;width:100%;font-size:12px}.gn-table th,.gn-table td{text-align:left;padding:10px 9px;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent);vertical-align:top}.gn-table th{font-size:10px;text-transform:uppercase;letter-spacing:.7px;opacity:.7}.gn-table td:last-child{max-width:430px}.gn-panel code{font-size:11px}.gn-panel ul{padding-left:18px;margin:6px 0}.gn-panel button{cursor:pointer}.gn-note{border-left:3px solid #d79729;padding-left:12px}.gn-table-wrap{overflow-x:auto}@media(max-width:700px){.gn-split{grid-template-columns:1fr}.gn-panel{padding:16px}}`;
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
      <style>{css + brandCss}</style>
      <div className="gn-brand" aria-label="Governator design system governance">
        <span className="gn-brand-mark" aria-hidden="true">
          G
        </span>
        <span>
          <strong>GOVERNATOR</strong>
          <small>DESIGN SYSTEM GOVERNANCE</small>
        </span>
      </div>
      <div className="gn-top">
        <div>
          <h2>{component?.componentId ?? (report ? "Unverified component" : "Governance")}</h2>
          {component ? (
            <>
              <div className="gn-chips">
                <span className="gn-chip">{component.lifecycle}</span>
                <span className="gn-chip" style={{ color: color(component.gate) }}>
                  Gate: {component.gate.replaceAll("_", " ")}
                </span>
              </div>
              <div className="gn-small">
                Owners: {component.owners?.join(", ") || "not provided"} · Target:{" "}
                {component.target}
              </div>
            </>
          ) : (
            !report && (
              <p className="gn-small">{componentId ?? "No component identity configured"}</p>
            )
          )}
        </div>
        <div>
          {component && <CopyId key={component.componentId} id={component.componentId} />}
          <button data-reload onClick={() => setRefresh((value) => value + 1)}>
            Reload report
          </button>
        </div>
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
              return false;
            api.selectStory(id);
            return true;
          }}
        />
      )}
      {storyId && (
        <TagEditor
          key={storyId}
          storyId={storyId}
          onDirtyChange={setTagEditsPending}
          drafts={tagDrafts}
        />
      )}
      {verifySource && storyId && componentId && (
        <RegistryEditor
          key={`${storyId}:${componentId}`}
          storyId={storyId}
          componentId={componentId}
          onDirtyChange={setRegistryEditsPending}
        />
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
const sidebarReports = new Map<string, { at: number; promise: Promise<ReportState> }>();
function sidebarReport(url: string, verifySource: boolean): Promise<ReportState> {
  const key = `${url}|${verifySource}`;
  const cached = sidebarReports.get(key);
  if (cached && Date.now() - cached.at < 30_000) return cached.promise;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const promise = loadReport(
    url,
    window.location.href,
    Date.now,
    fetch,
    controller.signal,
    verifySource,
  ).finally(() => clearTimeout(timeout));
  sidebarReports.set(key, { at: Date.now(), promise });
  return promise;
}
function SidebarLabel({ item, api, label }: { item: HashEntry; api: API; label: React.ReactNode }) {
  const theme = useTheme();
  const id = item.type === "component" ? item.children[0] : item.id;
  const params: unknown = id ? api.getParameters(id, "governance") : undefined;
  const componentId =
    params &&
    typeof params === "object" &&
    "componentId" in params &&
    typeof params.componentId === "string"
      ? params.componentId
      : undefined;
  const url =
    params &&
    typeof params === "object" &&
    "reportUrl" in params &&
    typeof params.reportUrl === "string"
      ? params.reportUrl
      : undefined;
  const verifySource = !!(
    params &&
    typeof params === "object" &&
    "registryEditor" in params &&
    params.registryEditor === true
  );
  const [state, setState] = useState<ReportState>({ status: "empty", message: "Unverified" });
  const [stateKey, setStateKey] = useState({ url, verified: verifySource });
  useFreshness(state, setState);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const update = () => {
      const request = ++generation;
      if (url)
        void sidebarReport(url, verifySource).then((value) => {
          if (active && request === generation) {
            setStateKey({ url, verified: verifySource });
            setState(revalidateReport(value));
          }
        });
      else setState({ status: "empty", message: "Unverified" });
    };
    update();
    const invalidate = () => {
      generation++;
      sidebarReports.clear();
      setState({ status: "error", message: "Registry changed; regenerate the report." });
    };
    window.addEventListener("governator:registry-changed", invalidate);
    const interval = setInterval(update, 60_000);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("governator:registry-changed", invalidate);
    };
  }, [url, componentId, verifySource]);
  const currentState =
    stateKey.url === url && stateKey.verified === verifySource
      ? revalidateReport(state)
      : { status: "empty" as const, message: "Unverified" };
  const component =
    currentState.status === "ready"
      ? currentState.report.decisions.find((c) => c.componentId === componentId)
      : undefined;
  const title = component
    ? `Report snapshot. Lifecycle: ${component.lifecycle}; readiness gate: ${component.gate}; release gate: ${currentState.status === "ready" ? (currentState.report.release?.gate ?? "unknown") : "unknown"}`
    : "Governance unverified: identity or current report unavailable";
  const sidebarAccent = theme.base === "dark" ? "#ff9fac" : "#98001d";
  return (
    <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
      <span>{label}</span>
      <small
        title={title}
        aria-label={title}
        style={{
          fontSize: 10,
          fontFamily: "ui-monospace, monospace",
          color: "inherit",
          border: "1px solid currentColor",
          borderLeft: `3px solid ${sidebarAccent}`,
          borderRadius: 2,
          padding: "1px 3px",
          whiteSpace: "nowrap",
        }}
      >
        {component
          ? `L ${component.lifecycle} · G ${component.gate === "insufficient_evidence" ? "missing" : component.gate}`
          : "?"}
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
          <SidebarLabel item={item} api={api} label={label} />
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
