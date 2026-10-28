# Storybook Source Navigation Implementation Plan

**Goal:** Navigate from report decisions to stories using explicit, source-derived component identities, and recover manager bundle headroom.

**Architecture:** Enrich Storybook's index from statically resolvable CSF governance parameters; ambiguous declarations do not produce a mapping. The manager uses the resulting index to present explicit story choices and never derives identities from titles. Keep report validation unchanged while removing unused validator error messages.

**Tech stack:** Storybook 10, CSF tools, React, TypeScript, Bun, Vitest, Ajv.

## Verification

- Test static metadata, story overrides, absent or dynamic declarations, and multiple stories per component.
- Test navigation, index changes and unavailable mappings; preserve stale-report behavior.
- Run addon, workspace and Storybook checks; compare compressed bundle against the previous 16,060-byte baseline.
- Verify a local Storybook interaction and independent packed consumer builds; document the supported boundaries.
