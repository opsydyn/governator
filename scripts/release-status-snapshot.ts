/* Public snapshot serialization is a small Bun I/O boundary. */
/* oxlint-disable linteffect/no-naked-object-state-update */
import { collectReleaseStatus } from "../apps/docs/src/lib/release-status";

// The token is optional and only sent to GitHub's fixed API origin.
// oxlint-disable-next-line linteffect/no-process-env-direct-read
const token = process.env.GITHUB_TOKEN;
const status = await collectReleaseStatus(
  (url) =>
    fetch(url, {
      signal: AbortSignal.timeout(8000),
      ...(token && url.startsWith("https://api.github.com/")
        ? { headers: { Authorization: `Bearer ${token}` } }
        : {}),
    }),
  new Date().toISOString(),
);
await Bun.write("apps/docs/public/status-snapshot.json", JSON.stringify(status) + "\n");
console.log("Release status snapshot generated.");
