/** @jsxRuntime classic */
import React, { useEffect, useState } from "react";
import { addons, types, useParameter } from "storybook/manager-api";
import { AddonPanel } from "storybook/internal/components";
import { useTheme } from "storybook/theming";
import { loadReport } from "./report.ts";
import type { ReportState } from "./report.ts";

const css = `.gn-panel{font:13px/1.5 ui-sans-serif,system-ui,sans-serif;padding:22px 26px;min-height:250px}.gn-panel *{box-sizing:border-box}.gn-panel h2{font-size:20px;letter-spacing:-.4px;margin:0}.gn-panel h3{font-size:13px;margin:0 0 9px}.gn-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.gn-small{font-size:11px;opacity:.72}.gn-chips{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:10px 0}.gn-chip{border:1px solid currentColor;border-radius:5px;padding:2px 8px;font-size:11px;font-weight:650}.gn-card{border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:8px;padding:15px 17px;margin-bottom:14px;background:color-mix(in srgb,currentColor 3%,transparent)}.gn-split{display:grid;grid-template-columns:1fr 1fr;gap:12px}.gn-table{border-collapse:collapse;width:100%;font-size:12px}.gn-table th,.gn-table td{text-align:left;padding:10px 9px;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent);vertical-align:top}.gn-table th{font-size:10px;text-transform:uppercase;letter-spacing:.7px;opacity:.7}.gn-table td:last-child{max-width:430px}.gn-panel code{font-size:11px}.gn-panel ul{padding-left:18px;margin:6px 0}.gn-panel button{font:inherit;border:1px solid color-mix(in srgb,currentColor 30%,transparent);background:transparent;color:inherit;border-radius:5px;padding:5px 9px;cursor:pointer}.gn-panel button:focus-visible{outline:3px solid #6b9bff;outline-offset:2px}.gn-note{border-left:3px solid #d79729;padding-left:12px}.gn-table-wrap{overflow-x:auto}@media(max-width:700px){.gn-split{grid-template-columns:1fr}.gn-panel{padding:16px}}`;
function Panel() {
  const theme = useTheme();
  const params = useParameter<{ componentId?: unknown; reportUrl?: unknown }>("governance", {});
  const componentId = typeof params.componentId === "string" ? params.componentId : undefined;
  const reportUrl = typeof params.reportUrl === "string" ? params.reportUrl : undefined;
  const [state, setState] = useState<ReportState>({
    status: "loading",
    message: "Loading governance snapshot…",
  });
  const [refresh, setRefresh] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    if (params.reportUrl !== undefined && typeof params.reportUrl !== "string") {
      setState({ status: "error", message: "Governance reportUrl must be a string." });
      clearTimeout(timeout);
      return () => controller.abort();
    }
    setState({ status: "loading", message: "Loading governance snapshot…" });
    void loadReport(reportUrl, window.location.href, Date.now(), fetch, controller.signal).then(
      (result) => {
        if (active) setState(result);
        clearTimeout(timeout);
      },
    );
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [reportUrl, refresh, params.reportUrl]);
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
  if (state.status !== "ready")
    return (
      <section
        className="gn-panel"
        style={{ color: theme.color.defaultText, background: theme.background.content }}
      >
        <style>{css}</style>
        <div className="gn-top">
          <div>
            <h2>Governance</h2>
            <p className="gn-small">{componentId ?? "No component identity configured"}</p>
          </div>
          <button onClick={() => setRefresh((value) => value + 1)}>Reload report</button>
        </div>
        <div role={state.status === "error" ? "alert" : "status"} className="gn-card gn-note">
          {state.message}
        </div>
        <p className="gn-small">
          A report is optional. This panel never grants approval or infers production deployment.
        </p>
      </section>
    );
  const report = state.report;
  const component = report.decisions.find((item) => item.componentId === componentId);
  if (!component)
    return (
      <section
        className="gn-panel"
        style={{ color: theme.color.defaultText, background: theme.background.content }}
      >
        <style>{css}</style>
        <h2>Unverified component</h2>
        <p role="status">
          {componentId
            ? `No registry decision for ${componentId}.`
            : "Link this story with parameters.governance.componentId."}
        </p>
      </section>
    );
  const compatibility = component.compatibility;
  return (
    <section
      className="gn-panel"
      style={{ color: theme.color.defaultText, background: theme.background.content }}
    >
      <style>{css}</style>
      <div className="gn-top">
        <div>
          <h2>{component.componentId}</h2>
          <div className="gn-chips">
            <span className="gn-chip">{component.lifecycle}</span>
            <span className="gn-chip" style={{ color: color(component.gate) }}>
              Gate: {component.gate.replaceAll("_", " ")}
            </span>
          </div>
          <div className="gn-small">
            Owners: {component.owners?.join(", ") || "not provided"} · Target: {component.target}
          </div>
        </div>
        <div>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(component.componentId).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied ID" : "Copy ID"}
          </button>{" "}
          <button onClick={() => setRefresh((value) => value + 1)}>Reload report</button>
        </div>
      </div>
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
            Component versions describe compatibility. The shared package is the installable unit.
          </p>
        </div>
        <div className="gn-card">
          <h3>Snapshot provenance</h3>
          <div>
            Policy <code>{report.policyVersion}</code> · {report.assurance}
          </div>
          <div className="gn-small">
            Source {report.commit.slice(0, 12)} · {new Date(report.evaluatedAt).toLocaleString()}
          </div>
          <p className="gn-small">
            Publication {report.publication} · Deployment {report.deployment} · Adoption{" "}
            {report.adoption}
          </p>
        </div>
      </div>
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
        Readiness, API compatibility, publication and deployment are independent. This snapshot does
        not grant human approval or prove production use.
      </p>
    </section>
  );
}
addons.register("governanator", () =>
  addons.add("governanator/governance", {
    title: "Governance",
    type: types.PANEL,
    render: ({ active }) => (
      <AddonPanel active={!!active}>
        <Panel />
      </AddonPanel>
    ),
  }),
);
