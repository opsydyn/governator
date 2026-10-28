# Public package preparation — local evidence

On 28 October 2026, local source commit `a23f37d8be344d5b7f01d9b5edbb78b31292cc78` was used to prepare the three `0.1.0` public package candidates. The repository release command and workflow remain disabled. This record does not authorize or establish publication.

The manifests use the repository/issue/homepage, public-access, provenance and `prepack` conventions of the local `@opsydyn/oxlint-effect` package. The Storybook addon, CLI and MCP are eligible for publication; all other workspace packages remain private. Repository access, npm scope ownership and package availability are unverified.

With an OS sandbox denying network access, `npm pack` ran each package's `prepack` build and produced these local archives:

| Package                       | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `@governator/cli`             | `0c325e4482bb7334a182fda80e2e3eb77e9e584b06311c178e79518d527b216c` |
| `@governator/mcp`             | `80b45e1fdb680e09af87a0e3676e49ad08ab0cb1b7373561f0230fafb3994585` |
| `@governator/storybook-addon` | `fc17e2349011ef82e3800890219d668bca92d5c8b5a1498504571bd89a96478d` |

Archive inspection found the declared exports and bins, package README, MIT license and bundled third-party notices. The CLI and MCP bundles include Effect; the addon's Node bundle includes Effect and YAML. The addon declares Storybook as its only peer and no runtime dependencies. CLI and MCP require Bun and do not declare Effect or private workspace packages as runtime or peer dependencies. `publint` passed for all three. The notices reflect the current inspected bundles; dependency updates require renewed bundle and license review.

Independent CLI/MCP consumers installed the npm-packed archives and passed the existing local qualification harness. Separate npm and strict-peer pnpm Storybook consumers installed a freshly staged Bun-packed addon from the same source and passed no-report static builds; its archive hash was `237cc299a357ba44f4aeebcbce761e4f11c2cc244926d32bd1cc8756c3a80726`, distinct from the npm-packed addon above. Browser interaction and configured-report checks were not performed in this run. Both harnesses used loopback-only registries reconstructed from extracted Bun cache, not original publisher archives; original npm integrity is unknown.

The local evidence is retained in the isolated checkout under `artifacts/cli-mcp-consumer-5976rJ/` and `artifacts/addon-consumer-3xyvrjkg/`. These observations are not final-candidate qualification, hosted workflow evidence, authenticated provenance, npm publication or human UX acceptance. Requalify the final release candidate under the release plan, including the still-open question of whether the Changesets publishing path preserves the approved archive bytes.
