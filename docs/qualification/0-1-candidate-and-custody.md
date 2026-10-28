# 0.1.0 candidate and publication custody — local evidence

On 28 October 2026, the clean candidate source was `4c5a0b92e068be2af15832a20919502e4deafcea`. These are observations about that commit, not approval to publish. Documentation and rehearsal commits added afterward change Git HEAD, so a release policy requiring an exact source commit must bind and requalify the actual release commit.

Bun 1.4.2, Node 24.15.0 and npm 11.12.1 were used. `bun run check --force` passed 740 tests across 68 files and all 18 Moon tasks without cached task results; `bun run storybook:build` passed with a chunk-size warning. The docs build warned that sitemap generation was skipped because no `site` is configured. An offline `npm pack` ran each `prepack` inside a network-denying sandbox:

| Package                       | SHA-256 of local npm archive                                       |
| ----------------------------- | ------------------------------------------------------------------ |
| `@governator/cli`             | `0c325e4482bb7334a182fda80e2e3eb77e9e584b06311c178e79518d527b216c` |
| `@governator/mcp`             | `80b45e1fdb680e09af87a0e3676e49ad08ab0cb1b7373561f0230fafb3994585` |
| `@governator/storybook-addon` | `fc17e2349011ef82e3800890219d668bca92d5c8b5a1498504571bd89a96478d` |

All archives contained their declared entry points, README, license and third-party notices; `publint` passed for each package. Independent CLI/MCP consumers installed those npm archives and passed the local qualification harness. npm and strict-peer pnpm Storybook consumers installed a separately Bun-packed addon from the same source (SHA-256 `237cc299a357ba44f4aeebcbce761e4f11c2cc244926d32bd1cc8756c3a80726`) and built both no-report and configured-report cases. The npm-packed and Bun-packed addon archives had different archive hashes but identical per-file paths and content hashes; this is not byte identity.

A computer-operated browser smoke in the npm consumer's disposable local Storybook saved a component name and a descriptive tag, then showed both after reload. The browser check was separate from the runner, whose browser fields remain open. This is not human UX or accessibility acceptance. Consumer installations used isolated loopback registries reconstructed from extracted Bun cache, with dependency lifecycle scripts disabled. They do not establish publisher-archive integrity, registry availability, scope ownership, hosted CI, or publication. Evidence is retained in `artifacts/cli-mcp-consumer-35n0SS/` and `artifacts/addon-consumer-1zxvwr1o/` in the isolated checkout.

## Changesets custody rehearsal

Run `node scripts/rehearse-publish-custody.mjs` on macOS with Bun, npm and Git available. The rehearsal creates a disposable Git fixture and loopback-only fake registry, uses a dummy token and confines npm subprocesses to loopback. It does not invoke the repository release command, use real credentials or contact the public registry. The fake registry deliberately accepts the same fixture version twice to make the two independent experiments comparable; a real npm registry would enforce its own duplicate-version rules.

The fixture's first `npm pack` ran `prepack` and produced an approved archive with SHA-256 `63b2993eaea3595fcc5ab6ab16c5a7183d430e1f2a617fcc3910b41861539c11`. The prepack input was then changed. Changesets CLI 2.31.0 selected the unpublished fixture version and invoked npm to publish its directory; the fake registry received SHA-256 `6d974d9a1cd4a37638ed995a2f7f39ec1766ac6573a68c667c250093ed25dd39`. Extracted `index.js` differed: `approved` versus `mutated-before-publish`. Separately, `npm publish` of the approved `.tgz` sent bytes with the original SHA-256 to the fake registry. The fixture evidence is `/private/tmp/governator-custody-fixture-n8TWqD/`.

The fixture-only comparison model accepts a matching source and package set and rejects changed bytes, name, version, commit, missing package and duplicate extra package. It is not connected to publishing and cannot enforce the production release boundary. A hash check before handing npm a mutable path also leaves a time-of-check/time-of-use race.

## Chosen direction and next design

The owner selected preservation of exact approved archives, adapting the publishing method. Keep Changesets for version intent and release coordination, and investigate a custom publish command that sends the approved `.tgz` files rather than allowing Changesets CLI to repack directories. Before implementation, specify and test:

- Trusted binding of source commit, package names and versions, archive digests, approval evidence and the exact set of three release packages; reject missing, extra, duplicate or altered inputs.
- Immutable custody through npm's actual read and transmission, including concurrent mutation and lifecycle behavior. Demonstrate point-of-use enforcement instead of relying on a preflight hash alone.
- Changesets/action output and tag behavior when using a custom publisher, partial publication and safe retries, registry readback, and npm provenance under the actual hosted identity.
- Authenticated owner policy, OIDC/token custody and real registry ownership as separately authorized hosted gates.

The loopback experiment is evidence for a possible mechanism, not proof of hosted provenance, production atomicity or a ready release. The repository release script and workflow remain disabled. Do not publish, push, activate the workflow or treat a simulated comparison as authorization.
