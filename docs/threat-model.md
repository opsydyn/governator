# Trust boundaries and limitations

Component authors can edit registry/story metadata and create JSON files. None of those actions can establish a trusted producer, reviewer, npm publication or application deployment. Provenance strings are claims; only host-adapter attestations over exact content can satisfy normal-mode requirements. M0 has no external verifier and cannot verify an approver's identity.

The CLI does not decode trust maps from disk or allow them as flags. Its normal-mode map is empty. Demo mode is explicit and labelled; callers must not promote demo reports into protected release workflows. All M0 release and deployment assertions remain unknown.

Filesystem inputs are restricted to the chosen real repository root, including configuration and evidence paths. M0 rejects symlinked source/configuration/evidence paths even when they resolve inside the root: Git tracking and dirty checks must cover the exact files read. A symlinked root itself is normalized before validation. Registry paths reject traversal and absolute Windows/POSIX paths. Inputs must be regular files. Missing optional evidence/waiver files mean no proof, while malformed or present-but-unreadable files are errors. YAML aliases are bounded and duplicate mapping keys fail parsing.

Normal evaluation requires Git HEAD, tracked source paths and clean governance/source inputs to avoid labelling modified files with an old SHA. This does not prove that HEAD was reviewed or that a binary was built from it. Exact artifact provenance and production candidate verification remain M1/M3. The report's `local:<folder>` repository identity is a local label, not a verified remote identity.

Canonical hashes detect content mismatches; they do not authenticate a baseline or attest an identity. Anyone who can edit both a baseline and its expected hash can replace both. Policy, waivers, contracts, baseline manifests and workflows need protected reviews/CODEOWNERS and required checks in a real host repository. `comparePolicy` is an offline comparison seam; the CLI does not fetch an approved historical policy or verify reviewers. Git history alone does not supply that approval.

M0 does not provide signatures, a policy approval database, remote credentials, telemetry, mutation APIs, shell command execution from configuration, npm publication or deployment integration. Git is invoked with fixed argument arrays; configuration is data, not executable policy. Resource limits beyond YAML alias bounds (such as maximum input size) are not yet implemented.
