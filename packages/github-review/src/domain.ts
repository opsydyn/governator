import { Match, Schema } from "effect";

const identity = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
const segment = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
  Schema.isPattern(/^(?!\.{1,2}$)[A-Za-z0-9_.-]+$/),
);
const scopeSchema = Schema.Struct({
  host: Schema.Literal("github.com"),
  owner: segment,
  repository: segment,
  pullRequest: identity,
  collectedAt: Schema.String.check(Schema.isMaxLength(24)),
});
export type ReviewScope = typeof scopeSchema.Type;
const reviewSchema = Schema.Struct({
  id: identity,
  actorId: identity,
  state: Schema.Literals(["approved", "changes_requested", "commented", "dismissed", "pending"]),
  commit: Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/)),
  submittedAt: Schema.String.check(Schema.isMaxLength(24)),
});
export type ReviewObservation = typeof reviewSchema.Type;

export const reviewLimits = Object.freeze({
  pages: 10,
  reviewsPerPage: 100,
  pageBytes: 1_048_576,
  totalBytes: 8_388_608,
  linkBytes: 8192,
  chunksPerPage: 16_384,
  jsonDepth: 64,
  defaultTimeoutMs: 10_000,
  maxTimeoutMs: 60_000,
});
export const reviewLimitations = Object.freeze([
  "current_head_unverified",
  "reviewer_roles_unverified",
  "artifact_binding_unverified",
  "cross_page_consistency_unverified",
  "effective_review_state_unverified",
  "provider_reported_pagination_only",
  "injected_transport_contract_required",
] as const);
export type ReviewReason =
  | "invalid_scope"
  | "invalid_options"
  | "invalid_review"
  | "malformed_json"
  | "missing_actor"
  | "missing_submission"
  | "duplicate_review"
  | "invalid_pagination"
  | "unsafe_response"
  | "page_limit"
  | "review_limit"
  | "page_bytes_limit"
  | "total_bytes_limit"
  | "body_chunks_limit"
  | "timeout"
  | "cancelled"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "provider_unavailable"
  | "transport_unavailable"
  | "body_unavailable";

type Envelope = {
  readonly schemaVersion: 1;
  readonly assurance: "unverified";
  readonly limitations: typeof reviewLimitations;
};
export type ReviewResult =
  | (Envelope & {
      readonly status: "complete";
      readonly scope: ReviewScope;
      readonly reasons: readonly [];
      readonly reviews: readonly ReviewObservation[];
    })
  | (Envelope & {
      readonly status: "incomplete" | "unavailable";
      readonly scope: ReviewScope | null;
      readonly reasons: readonly ReviewReason[];
    });

export type ReviewRequest = {
  readonly method: "GET";
  readonly redirect: "manual";
  readonly signal: AbortSignal;
};
export type ReviewResponse = {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly url: string;
  readonly redirected: boolean;
  readonly body: ReadableStream<Uint8Array>;
};
/** Caller owns credentials and MUST disable automatic redirects before sending them. */
export type ReviewTransport = (url: string, request: ReviewRequest) => Promise<ReviewResponse>;

type FailureDetails = Readonly<{ reason: ReviewReason; unavailable: boolean }>;
const failureDetails = new WeakMap<object, FailureDetails>();

/** No prototype or property inspection of an arbitrary thrown value. */
export function collectionFailureDetails(value: unknown): FailureDetails | undefined {
  return failureDetails.get(Object(value));
}

export class CollectionFailure extends Error {
  constructor(
    readonly reason: ReviewReason,
    readonly unavailable = false,
  ) {
    super(reason);
    this.name = "CollectionFailure";
    failureDetails.set(this, Object.freeze({ reason, unavailable }));
  }
}
export function requireCondition(condition: unknown, reason: ReviewReason): asserts condition {
  return Match.value(Boolean(condition)).pipe(
    Match.when(false, () => {
      throw new CollectionFailure(reason);
    }),
    Match.orElse(() => {}),
  );
}

/** Exact UTC round-trip rejects impossible calendar dates and unsupported precision. */
export function normalizeTimestamp(raw: unknown): string {
  const timestamp = Schema.decodeUnknownSync(
    Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)),
  )(raw);
  const [seconds, fraction = ""] = timestamp.slice(0, -1).split(".");
  const canonical = `${seconds}.${fraction.padEnd(3, "0")}Z`;
  const date = new Date(canonical);
  requireCondition(
    Number.isFinite(date.getTime()) && date.toISOString() === canonical,
    "invalid_review",
  );
  return canonical;
}

export function parseScope(raw: unknown): ReviewScope {
  const scope = Schema.decodeUnknownSync(scopeSchema, { onExcessProperty: "error" })(raw);
  requireCondition(normalizeTimestamp(scope.collectedAt) === scope.collectedAt, "invalid_scope");
  return scope;
}

const wireReview = Schema.Struct({
  id: Schema.Unknown,
  user: Schema.Unknown,
  state: Schema.Literals(["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED", "PENDING"]),
  commit_id: Schema.Unknown,
  submitted_at: Schema.optional(Schema.Unknown),
  pull_request_url: Schema.optional(Schema.Unknown),
});
const wireUser = Schema.Struct({ id: Schema.optional(Schema.Unknown) });

const pullRequestUrl = Schema.String.check(
  Schema.isPattern(
    /^https:\/\/api\.github\.com\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pulls\/[1-9]\d*$/,
  ),
);
function matchesPullRequestUrl(raw: unknown, expected: string): boolean {
  return Match.value(raw).pipe(
    Match.when(undefined, () => true),
    Match.when(
      Schema.is(pullRequestUrl),
      (value) => value.toLowerCase() === expected.toLowerCase(),
    ),
    Match.orElse(() => false),
  );
}

export function normalizeReview(raw: unknown, pullUrl: string): ReviewObservation {
  // Struct projection deliberately strips every unknown provider field.
  const item = Schema.decodeUnknownSync(wireReview)(raw);
  requireCondition(Schema.is(wireUser)(item.user), "missing_actor");
  const user = Schema.decodeUnknownSync(wireUser)(item.user);
  requireCondition(user.id !== null && user.id !== undefined, "missing_actor");
  requireCondition(
    item.submitted_at !== null && item.submitted_at !== undefined,
    "missing_submission",
  );
  requireCondition(matchesPullRequestUrl(item.pull_request_url, pullUrl), "invalid_review");
  return Schema.decodeUnknownSync(reviewSchema, { onExcessProperty: "error" })({
    id: item.id,
    actorId: user.id,
    state: item.state.toLowerCase(),
    commit: item.commit_id,
    submittedAt: normalizeTimestamp(item.submitted_at),
  });
}

const optionsSchema = Schema.Struct({
  signal: Schema.optional(Schema.instanceOf(AbortSignal)),
  timeoutMs: Schema.optional(
    Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThan(0),
      Schema.isLessThanOrEqualTo(reviewLimits.maxTimeoutMs),
    ),
  ),
});
export function parseOptions(raw: unknown): typeof optionsSchema.Type {
  return Schema.decodeUnknownSync(optionsSchema, { onExcessProperty: "error" })(raw);
}
