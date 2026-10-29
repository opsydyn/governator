# Governator 0.2.0 hosted archive rehearsal

On 29 October 2026, main was pushed and the existing retained candidate was staged without rebuilding or repacking. Candidate source remains `cfd81a9f7a2285a42ad850498071693b8d8cbf7a`; the successful rehearsal ran workflow source `17e6d6a8a67abad071fea932db884f2cdc61e263`.

The [draft candidate release](https://github.com/opsydyn/governator/releases/tag/untagged-53858fd966e032a6e1dc) is tagged `governator-v0.2.0-candidate` and targets the candidate source commit. It remains a draft. Its three uploaded assets were downloaded again locally and passed all tracked size, SHA-256 and SHA-512 checks.

| Archive                                      | GitHub asset ID | SHA-256                                                            |
| -------------------------------------------- | --------------- | ------------------------------------------------------------------ |
| opsydyn-governator-cli-0.2.0.tgz             | 689326524       | `9446366783b9731914b72b4f4c51dd1c781f76fccb5e06bf542d721c9e82d629` |
| opsydyn-governator-mcp-0.2.0.tgz             | 689326526       | `2fa7837b2be01e43d22cf088e43e0c73ba4316c5b0d1ddb3206dd1d6dcfe6901` |
| opsydyn-storybook-addon-governator-0.2.0.tgz | 689326522       | `fbb4050b2d970a755bc0c9e9e407f068c932af437fb4f05f2379ae7976e00639` |

[Rehearsal run 40921489993](https://github.com/opsydyn/governator/actions/runs/40921489993) succeeded. The draft-download job transferred those archives by Actions artifact ID. The separate release job checked the pinned hashes and completed npm dry runs for all three archives on Linux. The live publication step was skipped. The rehearsal step received no NPM_TOKEN and reported publication disabled.

[Initial run 40921047879](https://github.com/opsydyn/governator/actions/runs/40921047879) stopped at draft discovery before invoking npm because contents:read cannot discover a draft release. The fix gives contents:write only to the download job, which does not check out or execute repository code and receives neither npm credentials nor OIDC permission. The release job retains contents:read. The regression failed before that separation and passed afterward; targeted tests, typecheck, lint and formatting passed. No archive or package source changed.

Fresh pre-push checks passed 837 tests across 81 files and all 18 workspace tasks. The first pushed source also deployed documentation successfully in [Pages run 40920984821](https://github.com/opsydyn/governator/actions/runs/40920984821). Normal qualification CI for the permission fix is recorded separately from the successful publishing rehearsal.

Local evidence: `artifacts/publisher-0.2.0-JgPRAS/hosted/` contains the hosted rehearsal job/step results, logs, local GitHub asset readback checks and pre-push check log. These files and the original candidate archives remain ignored local evidence.

This qualifies draft retrieval, Actions artifact transfer, Linux hash verification and npm dry-run execution. It does not exercise live npm authentication, an upload to npm, registry propagation or npm provenance signing. Manual visual, keyboard, accessibility and first-user onboarding acceptance remains deferred until last. No npm publication or public GitHub release was performed.

The [local publishing adapter record](0-2-publishing.md) and [candidate qualification](0-2-candidate.md) retain the earlier evidence and operating instructions. Next: complete the deferred manual acceptance, then make a separate publication decision using these same archives.
