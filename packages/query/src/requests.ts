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
  "list_approved_components",
  "get_component_contract",
  "diff_component_contract",
  "list_breaking_changes",
  "explain_release_block",
  "get_release_manifest",
  "get_consumer_compatibility",
  "plan_component_migration",
]);
