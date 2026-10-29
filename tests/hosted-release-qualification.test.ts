import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

type Job = {
  if: string;
  environment?: string;
  needs?: string;
  permissions: Record<string, string>;
  steps: Array<{ uses?: string }>;
};
type Workflow = {
  on: Record<string, unknown>;
  jobs: Record<string, Job> & { build: Job; attest: Job; authentication: Job };
};

describe("hosted release qualification workflow", () => {
  const workflow = () =>
    Bun.YAML.parse(readFileSync(".github/workflows/release-qualification.yml", "utf8")) as Workflow;
  test("is manual, main-only and cannot invoke publication", () => {
    const text = readFileSync(".github/workflows/release-qualification.yml", "utf8");
    const value = workflow();
    expect(Object.keys(value.on)).toEqual(["workflow_dispatch"]);
    expect(text).not.toMatch(/npm\s+publish|bun\s+run\s+release(?:\s|$)/);
    for (const job of Object.values(value.jobs) as Array<{ if: string }>)
      expect(job.if).toContain("refs/heads/main");
  });
  test("isolates the npm token from build and attestation jobs", () => {
    const value = workflow();
    expect(JSON.stringify(value.jobs.build)).not.toContain("secrets.NPM_TOKEN");
    expect(JSON.stringify(value.jobs.attest)).not.toContain("secrets.NPM_TOKEN");
    expect(JSON.stringify(value.jobs.custody)).not.toContain("secrets.NPM_TOKEN");
    expect(JSON.stringify(value.jobs.custody)).toContain("unshare --net --fork");
    expect(JSON.stringify(value.jobs.custody)).toContain("qualify-sealed-registry.py");
    expect(JSON.stringify(value.jobs.custody)).toContain("needs.build.outputs.artifact-id");
    expect(JSON.stringify(value.jobs.custody)).toContain("ARTIFACT_ID");
    expect(JSON.stringify(value.jobs.authentication)).toContain("secrets.NPM_TOKEN");
    expect(value.jobs.authentication.environment).toBe("release-qualification");
    expect(value.jobs.attest.permissions["id-token"]).toBe("write");
  });
  test("uses pinned actions and passes the artifact ID to an independent job", () => {
    const value = workflow();
    expect(value.jobs.attest.needs).toBe("build");
    expect(JSON.stringify(value.jobs.attest)).toContain("needs.build.outputs.artifact-id");
    for (const job of Object.values(value.jobs) as Array<{ steps: Array<{ uses?: string }> }>) {
      for (const step of job.steps) if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
    }
  });
});
