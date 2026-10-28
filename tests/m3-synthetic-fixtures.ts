import { digest } from "@governator/core";

/** Entirely synthetic observations; no provider, identity or binding is authenticated. */
export function syntheticReviewFixture() {
  const repository = { provider: "github", host: "github.com", id: 101 };
  const policy = {
    schemaVersion: 1,
    id: "fixture-owners-v1",
    repository: { ...repository },
    completeness: "complete",
    observedAt: "2026-10-27T09:00:00.000Z",
    expiresAt: "2026-10-28T09:00:00.000Z",
    assignments: [{ actorId: 201, status: "active", roles: ["design-system-owner", "api-owner"] }],
  };
  const scope = {
    repository,
    pullRequest: 17,
    commit: "a".repeat(40),
    package: "@example/ui",
    packageVersion: "2.0.0",
    baselineDigest: `sha256:${"1".repeat(64)}`,
    candidateDigest: `sha256:${"2".repeat(64)}`,
    inputDigest: `sha256:${"3".repeat(64)}`,
    releasePolicyId: "release-v1",
    releasePolicyDigest: `sha256:${"4".repeat(64)}`,
    authorizationPolicyId: policy.id,
    authorizationPolicyDigest: digest(policy),
    candidateCreatedAt: "2026-10-27T10:00:00.000Z",
    distributedChange: true,
    major: true,
  };
  return {
    schemaVersion: 1,
    scope,
    at: "2026-10-27T12:00:00.000Z",
    policy,
    provider: {
      repository: { ...repository },
      pullRequest: 17,
      head: scope.commit,
      availability: "available",
      completeness: "complete",
      history: "supported",
      observedAt: "2026-10-27T11:30:00.000Z",
      expiresAt: "2026-10-28T11:30:00.000Z",
      reviews: [
        {
          id: 301,
          actorId: 201,
          commit: scope.commit,
          state: "approved",
          effective: "current",
          submittedAt: "2026-10-27T11:00:00.000Z",
          expiresAt: "2026-10-28T11:00:00.000Z",
        },
      ],
    },
    bindings: [
      {
        reviewId: 301,
        actorId: 201,
        scope: structuredClone(scope),
        observedAt: "2026-10-27T11:15:00.000Z",
        expiresAt: "2026-10-28T11:15:00.000Z",
      },
    ],
  };
}
