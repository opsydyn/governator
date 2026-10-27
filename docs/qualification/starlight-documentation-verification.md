# Starlight documentation — local verification

Date: 2026-10-27. This records local evidence for the [documentation design](../superpowers/specs/2026-10-27-starlight-documentation-design.md) at implementation commit `092a4ef`. No hosting, push or publication occurred.

## Installation and checks

- Root and documentation dependencies both installed from local cache with their frozen Bun locks. The docs app has a separate lock: a combined offline lock installed but failed the real Astro build because of an incompatible dependency resolution. Its pinned integrity records were drawn from existing local lockfiles. Contributors and CI install both locks.
- Astro check passed without errors, warnings or hints. Starlight built 14 HTML pages and a Pagefind index. The built-site link check passed internal page and fragment links; it does not check external URLs. The build warns that a sitemap is skipped because no public site URL is configured.
- The full workspace check passed **641 tests across 49 files** and all 18 Moon tasks; the workspace build completed all 13 tasks from cache. A static Hallmark floor check on the custom stylesheet passed.
- The documented clean-checkout tutorial ran: validation accepted four components, dogfood generated a source-bound v2 report, Storybook displayed the expected ready component and blocked release, snapshot export/query passed and the built MCP smoke matched all 14 tools. The snapshot remained unverified and publication/deployment remained unknown.
- Independent content and scaffold reviews found no remaining actionable findings after adding built-site link verification. Whole-branch review found no actionable findings.

## Browser observations

In the local built-site preview, the Changesets explanation opened from the sidebar. Searching for “Changesets” returned the explanation and release how-to; Escape closed search and returned focus to Search. At a 390 × 844 viewport the mobile menu opened and navigated to the CLI reference without page-level horizontal overflow. These observations are limited browser checks, not a screen-reader, WCAG, hosted CI or human acceptance assessment.
