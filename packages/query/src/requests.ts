import { Schema, Match } from "effect";
import { Lifecycle, ComponentId, SemVer } from "@governator/core";
const text = Schema.String.check(Schema.isMinLength(1));
const version = text;
const page = {
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^offset:[0-9]+$/))),
};
const component = { componentId: ComponentId };
const packageVersion = { packageId: text, candidateVersion: SemVer };
export const toolInputs = {
  list_components: Schema.Struct({
    ...page,
    filters: Schema.optionalKey(
      Schema.Struct({
        lifecycle: Schema.optionalKey(Lifecycle),
        gate: Schema.optionalKey(Schema.Literals(["ready", "blocked", "insufficient_evidence"])),
        owner: Schema.optionalKey(text),
      }),
    ),
  }),
  get_component: Schema.Struct(component),
  get_component_evidence: Schema.Struct(component),
  evaluate_component: Schema.Struct({ ...component, targetLifecycle: Lifecycle }),
  explain_governance_failure: Schema.Struct({ ...component, targetLifecycle: Lifecycle }),
  get_design_system_report: Schema.Record(Schema.String, Schema.Never),
  list_ready_components: Schema.Struct(page),
  list_approved_components: Schema.Struct(page),
  get_component_contract: Schema.Struct({
    ...component,
    contractVersion: Schema.optionalKey(SemVer),
  }),
  diff_component_contract: Schema.Struct({
    ...component,
    fromVersion: SemVer,
    toVersionOrCandidate: version,
  }),
  list_breaking_changes: Schema.Struct({
    ...page,
    packageId: Schema.optionalKey(text),
    sinceVersion: Schema.optionalKey(SemVer),
  }),
  explain_release_block: Schema.Struct(packageVersion),
  get_release_manifest: Schema.Struct({ packageId: text, version: SemVer }),
  get_consumer_compatibility: Schema.Struct(packageVersion),
  plan_component_migration: Schema.Struct({ ...component, fromVersion: SemVer, toVersion: SemVer }),
};
export type ToolName = keyof typeof toolInputs;
export const toolNames = Object.freeze(Object.keys(toolInputs) as ToolName[]);
export function toolInputJsonSchema(name: ToolName): Record<string, unknown> {
  return Match.value(name).pipe(
    Match.when("get_design_system_report", () => ({
      type: "object",
      properties: {},
      additionalProperties: false,
    })),
    Match.orElse(
      (value) =>
        Schema.toJsonSchemaDocument(toolInputs[value], { onExcessProperty: "error" }).schema,
    ),
  );
}
export interface Args {
  componentId?: string;
  targetLifecycle?: typeof Lifecycle.Type;
  packageId?: string;
  candidateVersion?: string;
  version?: string;
  contractVersion?: string;
  fromVersion?: string;
  toVersion?: string;
  toVersionOrCandidate?: string;
  sinceVersion?: string;
  limit?: number;
  cursor?: string;
  filters?: { lifecycle?: string; gate?: string; owner?: string };
}

export const ToolNameSchema = Schema.Literals([
  "list_components",
  "get_component",
  "get_component_evidence",
  "evaluate_component",
  "explain_governance_failure",
  "get_design_system_report",
  "list_ready_components",
  "list_approved_components",
  "get_component_contract",
  "diff_component_contract",
  "list_breaking_changes",
  "explain_release_block",
  "get_release_manifest",
  "get_consumer_compatibility",
  "plan_component_migration",
]);

/** Descriptions explain saved-data semantics and useful follow-up actions. */
export const toolDescriptions: Record<ToolName, string> = {
  list_components:
    "List registered components with optional lifecycle, recorded readiness gate and owner filters. Use pagination for large registries; use get_component to inspect one result.",
  get_component:
    "Read a component's metadata and recorded decisions by stable componentId. Unknown IDs return an error; begin with list_components when the ID is unknown.",
  get_component_evidence:
    "Inspect declared and reported evidence for a component. Saved evidence does not establish a fresh producer run; refresh through the CLI when needed.",
  evaluate_component:
    "Re-evaluate declared snapshot evidence for a target lifecycle. This pure evaluation has no verified attestations and may differ from a recorded local producer result.",
  explain_governance_failure:
    "Explain unmet requirements under a pure evaluation of snapshot declarations. Use get_component for the recorded result and get_component_evidence for available evidence.",
  get_design_system_report:
    "Read the saved governance report. It is not refreshed by this call; export a new snapshot after collecting new evidence.",
  list_ready_components:
    "List components recorded as ready under local policy. Returns approvalVerified=false; readiness is distinct from human approval and release eligibility.",
  list_approved_components:
    "Legacy name: list components recorded as ready under local policy. approvalVerified is false; these results do not establish human or release approval.",
  get_component_contract:
    "Read available component baseline or candidate contracts. Historical versions may be unavailable or ambiguous; no registry history is inferred.",
  diff_component_contract:
    "Compare available contracts for one component. Use candidate as the destination selector for the current proposed contract. Static types do not establish visual or behavioral compatibility.",
  list_breaking_changes:
    "List recorded detected API breaking changes, optionally filtered by package and version. Results cover available snapshot contracts only.",
  explain_release_block:
    "Explain recorded release blocks for the selected package and candidate version. Missing release inputs return not_configured; this tool cannot approve or publish.",
  get_release_manifest:
    "Read the recorded package release manifest and digests for a version. This does not independently establish an npm publication.",
  get_consumer_compatibility:
    "Inspect recorded consumer compatibility observations. Missing compiler evidence remains unavailable, not a passing result.",
  plan_component_migration:
    "Generate migration guidance from available contract changes and documents. Returns a plan only; does not modify consumers or execute repository instructions.",
};
