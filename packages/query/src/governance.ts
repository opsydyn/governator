import { evaluate, decode } from "@governanator/core";
import { queryEnsure, QueryScope } from "./domain.ts";
import type { QuerySnapshot, QueryResult } from "./domain.ts";
import type { Args, ToolName } from "./requests.ts";
export function createProjector(snapshot: QuerySnapshot) {
  const payload = snapshot.payload,
    diff = snapshot.computedDiff;
  function byId(id: string | undefined) {
    const found = payload.registry.components.find((c) => c.id === id);
    queryEnsure(!!found, `Unknown component: ${id ?? ""}`, "unknown_component");
    return found;
  }
  function recorded(id: string) {
    return payload.report.decisions.find((c) => c.componentId === id) ?? null;
  }
  function pageItems<T>(items: readonly T[], args: Args) {
    const start = args.cursor ? Number(args.cursor.slice(7)) : 0,
      limit = args.limit ?? 50;
    queryEnsure(
      Number.isSafeInteger(start) && start >= 0 && start <= items.length,
      "Invalid pagination cursor",
      "invalid_request",
    );
    const selected = items.slice(start, start + limit);
    const next =
      start + selected.length < items.length ? `offset:${start + selected.length}` : null;
    return { items: selected, total: items.length, nextCursor: next, truncated: next !== null };
  }
  function contract(id: string, requested?: string) {
    const component = byId(id);
    const current = payload.candidate?.api.components.find((c) => c.componentId === id);
    const old = payload.baseline?.api.components.find((c) => c.componentId === id);
    const found =
      !requested || requested === current?.contractVersion
        ? current
        : requested === old?.contractVersion
          ? old
          : undefined;
    if (!found)
      return {
        status: current || old ? "unavailable" : "not_configured",
        componentId: id,
        requestedVersion: requested ?? null,
        availableVersions: [
          ...new Set(
            [old?.contractVersion, current?.contractVersion].filter((v) => v !== undefined),
          ),
        ],
      };
    return {
      status: "available",
      componentId: id,
      packageId: component.package,
      contract: found,
      packageVersion:
        found === current
          ? payload.candidate?.manifest.version
          : payload.baseline?.manifest.version,
      source: found === current ? "recorded-candidate" : "local-baseline-fixture",
      publication: "unknown",
    };
  }
  function matchingRelease(args: Args) {
    return payload.release &&
      payload.release.packageId === args.packageId &&
      payload.release.candidateVersion === args.candidateVersion
      ? payload.release
      : null;
  }
  function componentDiff(args: Args, to = args.toVersionOrCandidate) {
    const component = byId(args.componentId);
    const old = payload.baseline?.api.components.find((c) => c.componentId === component.id),
      next = payload.candidate?.api.components.find((c) => c.componentId === component.id);
    if (!diff || !old || !next) return { status: "not_configured", componentId: component.id };
    const available = [...new Set([old.contractVersion, next.contractVersion])];
    if (
      args.fromVersion !== old.contractVersion ||
      (to !== "candidate" && to !== next.contractVersion)
    )
      return { status: "unavailable", availableVersions: available };
    const changes = diff.changes.filter(
      (c) => c.componentId === component.id || c.componentId === null,
    );
    return {
      status: "available",
      componentId: component.id,
      fromVersion: old.contractVersion,
      toVersion: next.contractVersion,
      baselineDigest: diff.baselineDigest,
      candidateDigest: diff.candidateDigest,
      minimumBump: changes.some((c) => c.bump === "major")
        ? "major"
        : changes.some((c) => c.bump === "unknown")
          ? "unknown"
          : changes.some((c) => c.bump === "minor")
            ? "minor"
            : "none",
      changes,
      limitations: diff.limitations,
    };
  }

  return function project(
    tool: ToolName,
    args: Args,
  ): { data: unknown; scope: QueryResult["scope"] } {
    let data: unknown;
    let scope: QueryResult["scope"] = decode(QueryScope, "recorded-snapshot");
    if (tool === "list_components") {
      const items = [...payload.registry.components]
        .sort((a, b) => a.id.localeCompare(b.id))
        .filter(
          (c) =>
            (!args.filters?.lifecycle || c.lifecycle === args.filters.lifecycle) &&
            (!args.filters?.owner || c.owners.includes(args.filters.owner)) &&
            (!args.filters?.gate || recorded(c.id)?.gate === args.filters.gate),
        )
        .map((c) => ({ ...c, reportedDecision: recorded(c.id) }));
      data = pageItems(items, args);
    } else if (tool === "get_component") {
      const c = byId(args.componentId);
      data = {
        ...c,
        reportedDecision: recorded(c.id),
        reportedRelease: payload.release,
        approvalVerified: false,
      };
    } else if (tool === "get_component_evidence") {
      const c = byId(args.componentId);
      data = {
        componentId: c.id,
        declaredEvidence: payload.evidence.filter((e) => e.componentId === c.id),
        reportedEvidence: payload.reportedEvidence.filter((e) => e.componentId === c.id),
        checks: recorded(c.id)?.checks ?? [],
        attestationRecreated: false,
      };
    } else if (tool === "evaluate_component" || tool === "explain_governance_failure") {
      const c = byId(args.componentId);
      const report = evaluate({
        registry: payload.registry,
        policy: payload.policy,
        evidence: payload.evidence,
        waivers: payload.waivers,
        target: args.targetLifecycle,
        at: snapshot.evaluatedAt,
        commit: snapshot.sourceCommit,
        repository: snapshot.repository,
        mode: "verified",
        verifiedEvidenceDigests: {},
        verifiedWaiverDigests: {},
      });
      data = report.decisions.find((item) => item.componentId === c.id);
      scope = "pure-unverified-evaluation";
    } else if (tool === "get_design_system_report") data = payload.report;
    else if (tool === "list_approved_components")
      data = {
        ...pageItems(
          payload.report.decisions.filter((c) => c.gate === "ready"),
          args,
        ),
        classification:
          payload.report.assurance === "demo"
            ? "eligible_under_demo_policy"
            : "eligible_under_local_policy",
        approvalVerified: false,
        policyVersion: payload.policy.policyVersion,
      };
    else if (tool === "get_component_contract")
      data = contract(args.componentId ?? "", args.contractVersion);
    else if (tool === "diff_component_contract") data = componentDiff(args);
    else if (tool === "list_breaking_changes") {
      if (!diff || (args.packageId && args.packageId !== diff.packageId))
        data = { status: "not_configured" };
      else if (
        args.sinceVersion &&
        ![diff.baselineVersion, diff.candidateVersion].includes(args.sinceVersion)
      )
        data = {
          status: "unavailable",
          availableVersions: [diff.baselineVersion, diff.candidateVersion],
        };
      else
        data = {
          status: "available",
          packageId: diff.packageId,
          ...pageItems(
            args.sinceVersion === diff.candidateVersion
              ? []
              : diff.changes.filter((c) => c.bump === "major"),
            args,
          ),
          baselineDigest: diff.baselineDigest,
          candidateDigest: diff.candidateDigest,
        };
    } else if (tool === "explain_release_block")
      data = matchingRelease(args) ?? {
        status: payload.release ? "unavailable" : "not_configured",
        publication: "unknown",
      };
    else if (tool === "get_release_manifest") {
      const artifact = [payload.baseline, payload.candidate].find(
        (a) => a?.manifest.name === args.packageId && a?.manifest.version === args.version,
      );
      data = artifact
        ? {
            status: "available",
            manifest: artifact.manifest,
            artifactDigest: artifact.artifactDigest,
            files: artifact.files,
            componentContracts: artifact.api.components.map((c) => ({
              componentId: c.componentId,
              contractVersion: c.contractVersion,
            })),
            source: artifact === payload.baseline ? "explicit-local-fixture" : "recorded-candidate",
            publication: "unknown",
            deployment: "unknown",
          }
        : { status: payload.baseline || payload.candidate ? "unavailable" : "not_configured" };
    } else if (tool === "get_consumer_compatibility") {
      const release = matchingRelease(args);
      data = release
        ? {
            status: "unverified-record",
            recordedCompile: release.consumerChecks ?? null,
            externalUsage: "unknown",
            adoption: "unknown",
            deployment: "unknown",
            candidateDigest: release.candidateDigest,
          }
        : { status: payload.release ? "unavailable" : "not_configured" };
    } else {
      const c = byId(args.componentId);
      const comparison = componentDiff(args, args.toVersion);
      scope = "derived-guidance";
      data = {
        ...comparison,
        observedFiles: [c.source, ...c.stories],
        documents: Object.entries(payload.documents).map(([path, content]) => ({ path, content })),
        suggestions: [
          "Review each detected public change against the linked migration guidance",
          "Compile known consumers and run their interaction/accessibility checks before an actual release",
        ],
        externalConsumers: "unknown",
        editsPerformed: false,
      };
    }

    return { data, scope };
  };
}
