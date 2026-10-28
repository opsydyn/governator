/* Public HTTP fixture records the requested URL. */
/* oxlint-disable linteffect/no-return-in-arrow */

import { describe, expect, it } from "vitest";
import { collectReleaseStatus, withSnapshotFallback } from "../apps/docs/src/lib/release-status";

describe("release status observations", () => {
  it("reports the latest CI run and published package versions with source metadata", async () => {
    const fetcher = async (url: string) =>
      url.includes("api.github.com")
        ? new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  status: "completed",
                  conclusion: "success",
                  head_sha: "abc123",
                  html_url: "https://github.com/opsydyn/governator/actions/runs/1",
                  updated_at: "2026-10-28T10:00:00Z",
                },
              ],
            }),
          )
        : new Response(JSON.stringify({ "dist-tags": { latest: "0.1.0" } }));
    const result = await collectReleaseStatus(fetcher, "2026-10-28T11:00:00Z");
    expect(result.ci.state).toBe("success");
    expect(result.ci.commit).toBe("abc123");
    expect(result.packages.map((item) => item.version)).toEqual(["0.1.0", "0.1.0", "0.1.0"]);
    expect(result.observedAt).toBe("2026-10-28T11:00:00Z");
  });
  it("distinguishes pending, not found and unavailable sources", async () => {
    const fetcher = async (url: string) =>
      url.includes("api.github.com")
        ? new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  status: "in_progress",
                  head_sha: "def456",
                  html_url: "https://github.com/opsydyn/governator/actions/runs/2",
                  updated_at: "2026-10-28T10:00:00Z",
                },
              ],
            }),
          )
        : url.includes("storybook-addon")
          ? new Response("", { status: 404 })
          : new Response("", { status: 503 });
    const result = await collectReleaseStatus(fetcher, "2026-10-28T11:00:00Z");
    expect(result.ci.state).toBe("in_progress");
    expect(result.packages.map((item) => item.state)).toEqual([
      "not_found",
      "unavailable",
      "unavailable",
    ]);
  });
  it("fails closed on invalid responses and network errors", async () => {
    const result = await collectReleaseStatus(async () => {
      throw new Error("offline");
    }, "2026-10-28T11:00:00Z");
    expect(result.ci.state).toBe("unavailable");
    expect(result.packages.every((item) => item.state === "unavailable")).toBe(true);
  });
});

it("uses explicitly marked snapshot observations when a live source is unavailable", async () => {
  const live = await collectReleaseStatus(async () => {
    throw new Error("offline");
  }, "2026-10-28T12:00:00Z");
  const snapshot = await collectReleaseStatus(
    async (url: string) =>
      url.includes("api.github.com")
        ? new Response(
            JSON.stringify({
              workflow_runs: [{ status: "completed", conclusion: "success", head_sha: "abc123" }],
            }),
          )
        : new Response("", { status: 404 }),
    "2026-10-28T10:00:00Z",
  );
  const result = withSnapshotFallback(live, snapshot);
  expect(result.ci.state).toBe("success");
  expect(result.ci.snapshotAt).toBe(snapshot.observedAt);
  expect(result.packages[0]?.state).toBe("not_found");
  expect(result.packages[0]?.snapshotAt).toBe(snapshot.observedAt);
});

it("requests only main-branch push runs, excluding pull requests", async () => {
  let ciRequest = "";
  await collectReleaseStatus(async (url: string) => {
    if (url.includes("api.github.com")) ciRequest = url;
    return new Response("{}", { status: 200 });
  }, "2026-10-28T12:00:00Z");
  expect(new URL(ciRequest).searchParams.get("event")).toBe("push");
  expect(new URL(ciRequest).searchParams.get("branch")).toBe("main");
});
