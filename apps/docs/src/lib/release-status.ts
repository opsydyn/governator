/* Browser/public HTTP adapter: native fetch and independent failure handling keep the docs bundle lightweight. */
/* oxlint-disable linteffect/no-string-sentinel-const, linteffect/no-return-in-arrow, linteffect/no-try-catch, linteffect/no-naked-object-state-update */
export type StatusFetcher = (url: string) => Promise<Response>;
export type ReleaseStatus = {
  observedAt: string;
  ci: { state: string; commit?: string; updatedAt?: string; url?: string; snapshotAt?: string };
  packages: {
    name: string;
    state: "published" | "not_found" | "unavailable";
    version?: string;
    snapshotAt?: string;
  }[];
};

const names = [
  "@opsydyn/storybook-addon-governator",
  "@opsydyn/governator-cli",
  "@opsydyn/governator-mcp",
];
const ciUrl =
  "https://api.github.com/repos/opsydyn/governator/actions/workflows/check.yml/runs?branch=main&event=push&per_page=1";

export async function collectReleaseStatus(
  fetcher: StatusFetcher,
  observedAt: string,
): Promise<ReleaseStatus> {
  const ci = await (async (): Promise<ReleaseStatus["ci"]> => {
    try {
      const response = await fetcher(ciUrl);
      if (!response.ok) return { state: "unavailable" };
      const data = await response.json();
      const run = data.workflow_runs?.[0];
      if (!run || typeof run.head_sha !== "string" || typeof run.status !== "string")
        return { state: "unavailable" };
      const state =
        run.status === "completed"
          ? typeof run.conclusion === "string"
            ? run.conclusion
            : "unavailable"
          : run.status;
      const safeUrl =
        typeof run.html_url === "string" &&
        /^https:\/\/github\.com\/opsydyn\/governator\/actions\/runs\/\d+$/.test(run.html_url)
          ? run.html_url
          : undefined;
      return {
        state,
        commit: run.head_sha,
        updatedAt: typeof run.updated_at === "string" ? run.updated_at : undefined,
        url: safeUrl,
      };
    } catch {
      return { state: "unavailable" };
    }
  })();
  const packages = await Promise.all(
    names.map(async (name): Promise<ReleaseStatus["packages"][number]> => {
      try {
        const response = await fetcher(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
        if (response.status === 404) return { name, state: "not_found" };
        if (!response.ok) return { name, state: "unavailable" };
        const data = await response.json();
        const version = data["dist-tags"]?.latest;
        if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version))
          return { name, state: "unavailable" };
        return { name, state: "published", version };
      } catch {
        return { name, state: "unavailable" };
      }
    }),
  );
  return { observedAt, ci, packages };
}

export function withSnapshotFallback(live: ReleaseStatus, snapshot: ReleaseStatus): ReleaseStatus {
  return {
    observedAt: live.observedAt,
    ci:
      live.ci.state === "unavailable" && snapshot.ci.state !== "unavailable"
        ? { ...snapshot.ci, snapshotAt: snapshot.observedAt }
        : live.ci,
    packages: live.packages.map((item) => {
      const previous = snapshot.packages.find((candidate) => candidate.name === item.name);
      return item.state === "unavailable" && previous && previous.state !== "unavailable"
        ? { ...previous, snapshotAt: snapshot.observedAt }
        : item;
    }),
  };
}
