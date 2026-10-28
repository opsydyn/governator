# @governator/protocol

Private M0 workspace package. See the root README and docs for supported commands, trust boundaries and release limitations.

The existing `./schema` export remains strict schema 1. `./schema/v1` names the
same schema; `./schema/v2` adds evidence metadata and `./schema/versioned` accepts
both versions. Unknown versions and extra properties are rejected. The readonly
`GovernanceReport` type is the discriminated union; `GovernanceReportV1` and
`GovernanceReportV2` name the individual contracts.

Core `evaluate(input)` and `evaluate(input, 1)` retain schema 1 output. Explicit
`evaluate(input, 2)` projects exactly the selected evidence records, in evidence-ID
order. `decodeReport(value)` in core validates both versions with strict shape
and semantic checks. Portable readers must first validate the strict versioned
JSON Schema, then call `reportSemanticsValid(report)`; JSON Schema alone cannot
express equality between selected IDs and metadata, global ID association, or
observation time relative to evaluation. The predicate expects a structurally
validated report. It does not authenticate any reported producer or provenance.

Schema 2 timestamps must be canonical UTC and observations cannot follow the
report evaluation time. Its metadata is supplied only from selected input records
matching ID, component and check. A missing optional `sourceUrl` is unknown;
source values are references, not a permission to navigate or fetch them. Schema 1
continues to carry IDs without metadata. Serialized consistency cannot prove a
producer's identity or detect a wholesale falsification of a self-consistent
report; hosts must preserve their existing authentication boundaries.
