/** @jsxRuntime classic */
import React from "react";
import type { GovernanceReport } from "@governator/protocol";
import { readinessView } from "./status-view.ts";
import { StatusBadge } from "./status-badge.tsx";

type Decision = GovernanceReport["decisions"][number];

export function PanelSummary({
  component,
  componentId,
  mode,
  headingRef,
}: {
  component: Decision | undefined;
  componentId: string | undefined;
  mode: "read-only" | "local-editing";
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const status = component ? readinessView(component.gate) : undefined;
  const firstProblem = component?.checks.find((check) => check.result !== "passed")?.reason;
  const why = component
    ? (firstProblem ?? component.reasons[0] ?? status?.description)
    : componentId
      ? `No decision for ${componentId} exists in the selected report.`
      : "This story has no explicit governance component identity.";
  const next = component
    ? component.gate === "ready"
      ? "Review compatibility and release status separately before shipping."
      : firstProblem
        ? `Resolve the first failing check: ${firstProblem}`
        : "Add the missing evidence, regenerate the report and reload this panel."
    : componentId
      ? "Regenerate the report after adding this component to the registry."
      : "Set parameters.governance.componentId on the story or component metadata.";
  return (
    <section className="gn-summary gn-card" aria-labelledby="gn-component-heading">
      <div className="gn-summary-heading">
        <div>
          <p className="gn-eyebrow">Selected component</p>
          <h2 id="gn-component-heading" data-gn-component-heading tabIndex={-1} ref={headingRef}>
            {component?.componentId ?? componentId ?? "Governance"}
          </h2>
        </div>
        <StatusBadge tone={mode === "local-editing" ? "accent" : "neutral"}>
          {mode === "local-editing" ? "Local editing enabled" : "Read-only snapshot"}
        </StatusBadge>
      </div>
      {component && status && (
        <div className="gn-chips" aria-label="Component status">
          <StatusBadge>{component.lifecycle}</StatusBadge>
          <StatusBadge tone={status.tone} description={status.description}>
            {status.label}
          </StatusBadge>
          <span className="gn-small">
            Owners: {component.owners?.join(", ") || "not provided"} · Target: {component.target}
          </span>
        </div>
      )}
      <dl className="gn-decision-copy">
        <div>
          <dt>Why this status</dt>
          <dd>{why}</dd>
        </div>
        <div>
          <dt>Next action</dt>
          <dd>{next}</dd>
        </div>
      </dl>
    </section>
  );
}
