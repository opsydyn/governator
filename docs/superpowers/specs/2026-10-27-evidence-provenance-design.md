# Evidence provenance in governance reports

## Intent and scope

A design-system maintainer needs to see which evidence supports each Storybook check, who reported it, when it was observed, and where its source is recorded. The current report exposes evidence IDs only. Extend the local report and panel without changing a readiness decision, conferring trust on serialized data, or enabling publication. The initial package version remains `0.1.0`.

## Approaches

1. Add optional fields to schema 1. This is small but breaks existing strict schema-1 validators and is rejected.
2. Introduce schema 2, preserve schema 1, and teach new readers both. Keep schema 1 as the compatibility output unless schema 2 is explicitly requested; the dogfood flow opts in to schema 2. Older readers fail closed on schema 2. This is the recommended approach: existing output continues to work, while new consumers can explicitly enable the added evidence.
3. Ship a separate evidence sidecar. This avoids changing the existing report but adds a second synchronization and authenticity boundary and complicates offline use; it is not recommended for this slice.

## Contract and behavior

- Keep the existing schema-1 contract and fixtures compatible. Add a strictly validated schema-2 report, with evidence details associated with the exact IDs already selected by each decision's check. Preserve deterministic ordering, gates, reasons and existing evidence IDs. Do not add unrelated evidence, infer missing values, or use serialized metadata to authenticate a producer or alter a gate.
- For each schema-2 check, supply exactly one metadata record for each selected evidence ID, keyed by ID and in deterministic order; no duplicate, missing, unreferenced or cross-check records are valid. Project producer, observation timestamp, optional source reference and declared provenance from the evaluated input only after matching ID, component and check. Duplicate input IDs remain invalid. This consistency check does not establish authenticity. Missing metadata in schema 1 or an optional source is explicitly unknown.
- The observation timestamp is canonical UTC and no later than the report evaluation time. Present it and its age relative to that evaluation time, labelled accordingly; this age is not a live freshness guarantee. Display producer and provenance as reported information; even an `adapter` label is not proof of external authentication. Show a missing source as unknown. Treat repository-relative artifact paths as text, not as browser links. Make absolute HTTP(S) URLs without credentials keyboard-accessible links, without automatically fetching them; render all other values safely as text and never navigate to executable schemes.
- New addon and report consumers accept strict v1 and v2; unknown versions and malformed, mismatched or extra fields fail closed. Existing v1 consumers keep accepting v1 and reject v2. Provide a documented version selection covering evaluation, local check and CLI report generation, leaving existing callers and outputs on v1 by default; the dogfood flow explicitly requests v2. Snapshot export preserves the selected report and version. MCP re-evaluation must not silently change the recorded version or claim metadata parity when it cannot reproduce it. Validate and preserve both versions across the generated protocol, standalone addon validator, CLI and embedded MCP snapshots. No silent stripping that could turn invalid v2 input into valid v1.
- Current report freshness, same-origin fetching, focus recovery and release semantics remain unchanged. Preserve Storybook as the addon's only consumer peer, no Effect/core/CLI/MCP browser dependency, and the existing 128 KiB raw / 16 KiB gzip budget. Check bundle feasibility early; do not raise the budget silently.

## Verification

First measure whether a dual-version validator and minimal panel fit the existing addon budget; seek an implementation that avoids duplicated validation before considering any change to the budget or strictness. Use real evaluated evidence and focused tests for passed, failed, expired, waived and missing checks; exact association and deterministic ordering; v1 compatibility and v2 strictness; unsupported versions and old-reader rejection; malformed and future timestamps; safe source rendering and unsafe URLs; and v1/v2 CLI, Storybook and MCP snapshot parity. Exercise actual panel rendering, including unknown fields and keyboard-accessible links. Re-run bundle and dependency checks, full local checks/builds, independent review, and a local dogfood browser check. Record actual observations and limits; no claim of screen-reader, hosted or production qualification follows from local tests.

Local-only work, local commits and fast-forward to main are authorized for the implementation. Real provider access, remote changes, push, publication and deployment remain outside this slice.
