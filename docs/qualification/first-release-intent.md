# Initial 0.1.0 release intent

The first intended public packages are `@governator/storybook-addon`, `@governator/cli` and `@governator/mcp`, at 0.1.0. They remain private and publication remains disabled pending package qualification and separate authorization. Other workspace packages remain private. The npm scope and package availability have not been verified.

The first release will introduce the Storybook governance addon, the local governance CLI and the read-only MCP interface. This is an initial release note, not a claim that any package has been published or that its final contents have been qualified.

Pre-release Changesets are preserved under `fixtures/release-intent/history/`; they are not active release requests. The demo's invalid patch is recreated in the isolated `release:demo` repository. In the main checkout, `governance/release.json` enumerates actual pending Changesets, currently none. A normal dogfood candidate with no intent remains blocked; the isolated simulation specifically tests the insufficient patch declaration.

A local Changesets CLI rehearsal used a disposable clone with only the three selected manifests changed to `private: false`, no pending Changesets, and a stub `npm` executable that returned package-not-found for every lookup and recorded publish calls. Changesets 2.31.0 selected all three existing 0.1.0 versions and no private packages. Its reported publishing success and local tags were simulated: the stub made no registry request, executed no lifecycle scripts and uploaded no bytes. This establishes package selection, not artifact custody, real package availability, provenance, or a successful npm publication. The actual release script and workflow remain disabled.
