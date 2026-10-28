# Governator release status implementation plan

Goal: Show current public CI and npm observations in a branded dashboard while retaining the existing artwork.

- Build a shared, testable collector for GitHub Actions and the public npm registry; represent pending, failed, missing and unavailable results explicitly.
- Generate a timestamped fallback snapshot during Pages builds. Refresh observations in the browser on page load; identify snapshot age and source commits.
- Add the dashboard and README badges, preserving the poster and its illustration note. Keep example governance results distinct from release authorization.
- Verify collector failure cases, build, links, browser behaviour and hosted deployment; preserve unrelated work and do not publish packages.
