import { Match, Schema } from "effect";
import {
  canonicalJson,
  Commit,
  decode,
  digest,
  SemVer,
  Timestamp,
  validTimestamp,
} from "@governator/core";
import { Hash } from "./release-schema.ts";

const text = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const identity = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
const completeness = Schema.Literals(["complete", "partial", "unknown"]);
const role = Schema.Literals(["design-system-owner", "api-owner"]);
const repository = Schema.Struct({
  provider: Schema.Literal("github"),
  host: Schema.String.check(
    Schema.isMaxLength(253),
    Schema.isPattern(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
  ),
  id: identity,
});

/** Expected artifact and policy identity, supplied separately from fixture observations. */
export const SyntheticReviewScope = Schema.Struct({
  repository,
  pullRequest: identity,
  commit: Commit,
  package: text,
  packageVersion: SemVer.check(Schema.isMaxLength(256)),
  baselineDigest: Hash,
  candidateDigest: Hash,
  inputDigest: Hash,
  releasePolicyId: text,
  releasePolicyDigest: Hash,
  authorizationPolicyId: text,
  authorizationPolicyDigest: Hash,
  candidateCreatedAt: Timestamp,
  distributedChange: Schema.Boolean,
  major: Schema.Boolean,
});
export type SyntheticReviewScope = typeof SyntheticReviewScope.Type;

/** This fixture policy and its digest provide consistency only, never independent authority. */
export const SyntheticAuthorizationPolicy = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  id: text,
  repository,
  completeness,
  observedAt: Timestamp,
  expiresAt: Timestamp,
  assignments: Schema.Array(
    Schema.Struct({
      actorId: identity,
      status: Schema.Literals(["active", "revoked", "unknown"]),
      roles: Schema.Array(role).check(Schema.isMaxLength(2)),
    }),
  ).check(Schema.isMaxLength(1000)),
});
export type SyntheticAuthorizationPolicy = typeof SyntheticAuthorizationPolicy.Type;

export const SyntheticProviderObservation = Schema.Struct({
  repository,
  pullRequest: identity,
  head: Commit,
  availability: Schema.Literals(["available", "unavailable", "unknown"]),
  completeness,
  history: Schema.Literals(["supported", "unknown"]),
  observedAt: Timestamp,
  expiresAt: Timestamp,
  reviews: Schema.Array(
    Schema.Struct({
      id: identity,
      actorId: identity,
      commit: Commit,
      state: Schema.Literals([
        "approved",
        "changes_requested",
        "dismissed",
        "commented",
        "pending",
        "unknown",
      ]),
      effective: Schema.Literals(["current", "superseded", "unknown"]),
      submittedAt: Timestamp,
      expiresAt: Timestamp,
    }),
  ).check(Schema.isMaxLength(1000)),
});
export type SyntheticProviderObservation = typeof SyntheticProviderObservation.Type;

/** Independent fixture claim; it is neither a review body nor an authenticated attestation. */
export const SyntheticArtifactBinding = Schema.Struct({
  reviewId: identity,
  actorId: identity,
  scope: SyntheticReviewScope,
  observedAt: Timestamp,
  expiresAt: Timestamp,
});
export type SyntheticArtifactBinding = typeof SyntheticArtifactBinding.Type;

export const SyntheticReviewInput = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  scope: SyntheticReviewScope,
  at: Timestamp,
  policy: SyntheticAuthorizationPolicy,
  provider: SyntheticProviderObservation,
  bindings: Schema.Array(SyntheticArtifactBinding).check(Schema.isMaxLength(1000)),
});
export type SyntheticReviewInput = typeof SyntheticReviewInput.Type;

export const SyntheticReviewReason = Schema.Literals([
  "no_distributed_change",
  "candidate_time_invalid",
  "policy_scope_mismatch",
  "policy_digest_mismatch",
  "policy_incomplete",
  "policy_time_invalid",
  "policy_ambiguous",
  "provider_scope_mismatch",
  "provider_unavailable",
  "provider_incomplete",
  "provider_history_unknown",
  "provider_time_invalid",
  "duplicate_review",
  "ambiguous_current_reviews",
  "review_state_unknown",
  "review_scope_mismatch",
  "review_time_invalid",
  "changes_requested",
  "reviewer_unauthorized",
  "duplicate_binding",
  "binding_identity_mismatch",
  "binding_scope_mismatch",
  "binding_time_invalid",
  "binding_missing",
  "design_system_owner_missing",
  "api_owner_missing",
]);
export type SyntheticReviewReason = typeof SyntheticReviewReason.Type;
export const SyntheticReviewResult = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  assurance: Schema.Literal("simulated"),
  status: Schema.Literals(["matched", "insufficient_evidence", "not_required"]),
  reasons: Schema.Array(SyntheticReviewReason),
});
export type SyntheticReviewResult = typeof SyntheticReviewResult.Type;

const complete = Schema.is(Schema.Literal("complete"));
const available = Schema.is(Schema.Literal("available"));
const supported = Schema.is(Schema.Literal("supported"));
const currentReview = Schema.is(Schema.Literal("current"));
const unknownState = Schema.is(Schema.Literal("unknown"));
const pending = Schema.is(Schema.Literal("pending"));
const changesRequested = Schema.is(Schema.Literal("changes_requested"));
const approved = Schema.is(Schema.Literal("approved"));
const active = Schema.is(Schema.Literal("active"));
const day = 24 * 60 * 60 * 1000;
function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
function duplicate(values: readonly (number | string)[]): boolean {
  return new Set(values).size !== values.length;
}
function interval(
  observedAt: string,
  expiresAt: string,
  now: number,
  earliest = -Infinity,
): boolean {
  const observed = validTimestamp(observedAt),
    expires = validTimestamp(expiresAt);
  const bounds = [
    observed >= earliest,
    observed <= now,
    now - observed <= day,
    expires > now,
    expires > observed,
    expires - observed <= day,
  ];
  return bounds.every(Boolean);
}

/**
 * Pure fixture evaluator. Strict schemas reject extra trust/role properties and malformed input.
 * All numeric IDs are positive safe integers, all timestamps canonical UTC, and collections bounded.
 * A complete provider fixture must explicitly label effective review state; no GitHub history
 * aggregation is inferred. Ambiguity fails closed. Policies may predate candidate creation.
 * Same-scope rechecks are idempotent; this has no durable replay store, credentials or trust grant.
 */
export function evaluateSyntheticReview(raw: unknown): SyntheticReviewResult {
  const input = decode(SyntheticReviewInput, raw);
  const { scope, policy, provider, bindings } = input;
  const now = validTimestamp(input.at),
    created = validTimestamp(scope.candidateCreatedAt);
  // Validate every timestamp even in ignored/superseded/unavailable fixture records.
  for (const item of [policy, provider, ...bindings]) {
    validTimestamp(item.observedAt);
    validTimestamp(item.expiresAt);
  }
  for (const review of provider.reviews) {
    validTimestamp(review.submittedAt);
    validTimestamp(review.expiresAt);
  }
  for (const binding of bindings) validTimestamp(binding.scope.candidateCreatedAt);
  const reasons = new Set<SyntheticReviewReason>();
  function check(failed: boolean, reason: SyntheticReviewReason): void {
    const failures = Match.value(failed).pipe(
      Match.when(true, () => [reason]),
      Match.orElse(() => []),
    );
    for (const failure of failures) reasons.add(failure);
  }
  check(created > now || now - created > day, "candidate_time_invalid");
  check(
    policy.id !== scope.authorizationPolicyId || !same(policy.repository, scope.repository),
    "policy_scope_mismatch",
  );
  // This unkeyed hash detects inconsistent fixture inputs; it authenticates nothing.
  check(digest(policy) !== scope.authorizationPolicyDigest, "policy_digest_mismatch");
  check(!complete(policy.completeness), "policy_incomplete");
  check(!interval(policy.observedAt, policy.expiresAt, now), "policy_time_invalid");
  check(
    duplicate(policy.assignments.map((a) => a.actorId)) ||
      policy.assignments.some((a) => duplicate(a.roles)),
    "policy_ambiguous",
  );
  check(
    !same(provider.repository, scope.repository) ||
      provider.pullRequest !== scope.pullRequest ||
      provider.head !== scope.commit,
    "provider_scope_mismatch",
  );
  check(!available(provider.availability), "provider_unavailable");
  check(!complete(provider.completeness), "provider_incomplete");
  check(!supported(provider.history), "provider_history_unknown");
  check(!interval(provider.observedAt, provider.expiresAt, now, created), "provider_time_invalid");
  check(duplicate(provider.reviews.map((r) => r.id)), "duplicate_review");
  const current = provider.reviews.filter((r) => currentReview(r.effective));
  check(duplicate(current.map((r) => r.actorId)), "ambiguous_current_reviews");
  check(duplicate(bindings.map((b) => b.reviewId)), "duplicate_binding");
  const validBindings = new Set<number>();
  for (const binding of bindings) {
    const review = provider.reviews.find((r) => r.id === binding.reviewId);
    const identityMatches = review !== undefined && review.actorId === binding.actorId;
    const scopeMatches = same(binding.scope, scope);
    const fresh = interval(binding.observedAt, binding.expiresAt, now, created);
    check(!identityMatches, "binding_identity_mismatch");
    check(!scopeMatches, "binding_scope_mismatch");
    check(!fresh, "binding_time_invalid");
    const matches = Match.value(identityMatches && scopeMatches && fresh).pipe(
      Match.when(true, () => [binding.reviewId]),
      Match.orElse(() => []),
    );
    for (const id of matches) validBindings.add(id);
  }
  const covered = new Set<typeof role.Type>();
  for (const review of provider.reviews) {
    check(
      validTimestamp(review.submittedAt) > validTimestamp(provider.observedAt),
      "provider_time_invalid",
    );
    check(unknownState(review.effective), "review_state_unknown");
  }
  for (const review of current) {
    check(unknownState(review.state) || pending(review.state), "review_state_unknown");
    check(changesRequested(review.state), "changes_requested");
    check(!interval(review.submittedAt, review.expiresAt, now, created), "review_time_invalid");
    check(review.commit !== scope.commit, "review_scope_mismatch");
  }
  for (const review of current.filter((r) => approved(r.state))) {
    const assignment = policy.assignments.find((a) => a.actorId === review.actorId);
    const authorized = active(assignment?.status);
    const bound = validBindings.has(review.id);
    check(!authorized, "reviewer_unauthorized");
    check(!bound, "binding_missing");
    const eligible =
      authorized &&
      bound &&
      review.commit === scope.commit &&
      interval(review.submittedAt, review.expiresAt, now, created);
    for (const assigned of (assignment?.roles ?? []).filter(() => eligible)) covered.add(assigned);
  }
  check(!covered.has("design-system-owner"), "design_system_owner_missing");
  check(scope.major && !covered.has("api-owner"), "api_owner_missing");
  const status = Match.value(reasons.size).pipe(
    Match.when(0, () => "matched" as const),
    Match.orElse(() => "insufficient_evidence" as const),
  );
  const evaluated: SyntheticReviewResult = {
    schemaVersion: 1,
    assurance: "simulated",
    status,
    reasons: [...reasons].sort(),
  };
  const notRequired: SyntheticReviewResult = {
    schemaVersion: 1,
    assurance: "simulated",
    status: "not_required",
    reasons: ["no_distributed_change"],
  };
  return Match.value(scope.distributedChange).pipe(
    Match.when(false, () => notRequired),
    Match.orElse(() => evaluated),
  );
}
