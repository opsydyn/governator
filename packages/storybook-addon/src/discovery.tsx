/** @jsxRuntime classic */
import React, { useState } from "react";
import type { GovernanceReport } from "@governator/protocol";

type Decision = Pick<
  GovernanceReport["decisions"][number],
  "componentId" | "package" | "gate" | "lifecycle" | "owners" | "reasons"
>;
type Filter = "attention" | "all" | "blocked" | "insufficient_evidence" | "ready";

/** Lists report decisions without guessing story IDs or changing governance. */
export function Discovery({ decisions }: { decisions: readonly Decision[] }) {
  const [filter, setFilter] = useState<Filter>("attention");
  const [search, setSearch] = useState("");
  const attention = decisions.filter((item) => item.gate !== "ready").length;
  const query = search.trim().toLowerCase();
  const matches = decisions.filter((item) => {
    const gateMatches =
      filter === "all" || (filter === "attention" ? item.gate !== "ready" : item.gate === filter);
    const searchable = [item.componentId, item.package, ...(item.owners ?? [])]
      .join(" ")
      .toLowerCase();
    return gateMatches && searchable.includes(query);
  });
  return (
    <details className="gn-discovery gn-card">
      <summary>
        <span>Find components</span>
        <span className="gn-discovery-count">
          {attention} readiness gates need attention / {decisions.length} in report
        </span>
      </summary>
      <p className="gn-small">
        These are readiness decisions from this report. Release and API compatibility are separate.
        Use Storybook's sidebar to find the relevant story; report IDs may not match story names.
      </p>
      <div className="gn-discovery-controls">
        <label>
          Readiness{" "}
          <select
            aria-label="Readiness filter"
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value as Filter)}
          >
            <option value="attention">Needs attention</option>
            <option value="all">All components</option>
            <option value="blocked">Blocked</option>
            <option value="insufficient_evidence">Insufficient evidence</option>
            <option value="ready">Ready</option>
          </select>
        </label>
        <label>
          Search{" "}
          <input
            aria-label="Search components"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="ID, package or owner"
          />
        </label>
      </div>
      <p className="gn-small" role="status" aria-live="polite">
        {matches.length
          ? `${matches.length} matching components${matches.length > 100 ? "; showing first 100" : ""}`
          : "No components match"}
      </p>
      <ul className="gn-discovery-list">
        {matches.slice(0, 100).map((item) => (
          <li key={item.componentId}>
            <div>
              <code>{item.componentId}</code>{" "}
              <span className={`gn-gate gn-gate-${item.gate}`}>
                {item.gate.replaceAll("_", " ")}
              </span>
            </div>
            <span className="gn-small">
              {item.lifecycle} · {item.owners?.join(", ") || "owner not provided"}
            </span>
            {item.reasons[0] && <p className="gn-small">{item.reasons[0]}</p>}
          </li>
        ))}
      </ul>
    </details>
  );
}
