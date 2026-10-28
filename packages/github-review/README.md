# Private GitHub review reader

`@governator/github-review` collects **unverified source-review observations** through a caller-supplied transport. It is private and is not connected to the release evaluator, CLI, public protocol, Storybook addon or MCP. Importing it performs no requests. It discovers no credentials, repository, environment settings or global client and provides no default HTTP implementation.

## API

```ts
collectGithubReviews(
  rawScope: unknown,
  transport: ReviewTransport,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<ReviewResult>
```

The scope is strictly decoded with Effect Schema. All fields are required; extra fields are rejected:

```ts
{
  host: "github.com",
  owner: "example-org",
  repository: "design-system",
  pullRequest: 17,
  collectedAt: "2026-10-27T12:00:00.000Z"
}
```

`owner` and `repository` are 1–100 safe ASCII path characters (`A-Z`, `a-z`, digits, `_`, `-`, `.`), excluding `.` and `..`. `pullRequest` is a positive safe integer. `collectedAt` is an explicit caller clock value in canonical UTC with exactly three fractional digits and a real calendar date; it does not authenticate collection time. The collector never reads a wall clock to supply observation evidence. Monotonic elapsed time is used only to enforce the collection deadline.

The optional cancellation signal must be a native `AbortSignal` with unmodified initial event and state hooks. Customized or malformed hooks return `invalid_options`; native cancellation remains supported.

The transport has this contract:

```ts
type ReviewTransport = (
  url: string,
  request: {
    readonly method: "GET";
    readonly redirect: "manual";
    readonly signal: AbortSignal;
  },
) => Promise<{
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly url: string;
  readonly redirected: boolean;
  readonly body: ReadableStream<Uint8Array>;
}>;
```

The only requested resource is `https://api.github.com/repos/{owner}/{repository}/pulls/{pullRequest}/reviews?per_page=100&page={page}`. The caller owns authentication. **The transport must disable automatic redirects before sending credentials**, honor the abort signal where possible, and report the actual final URL and redirect state. A dishonest transport can already exfiltrate credentials or invent data: these checks are conditional on its contract and are not authentication. A future real transport requires separate qualification. The PR-detail endpoint is never requested.

Pagination accepts only absolute links to the exact requested review endpoint, with exactly `per_page=100` and a positive canonical `page` integer in either parameter order. `next` must be the following page; duplicate relations, loops, unsupported relations, traversal, credentials, fragments and altered parameters fail closed. Other supported relations are `prev`, `first` and `last`, with consistency checks. Pagination endpoint casing must exactly match the request. A review's optional `pull_request_url` permits GitHub's canonical ASCII capitalization of the same owner/repository, while still requiring the exact HTTPS host, path shape and PR number.

## Results

Every result contains `schemaVersion: 1`, `assurance: "unverified"`, `status`, `scope`, `reasons` and `limitations`.

- `complete`: `scope` preserves the validated caller scope, `reasons` is empty, and `reviews` contains observations. An empty final listing is allowed. Missing `Link` means only that the provider reported the end.
- `incomplete`: invalid/unsafe response, pagination, identity, timestamp, stream data or budget; also a later-page availability failure. **There is no partial `reviews` field.**
- `unavailable`: invalid caller scope/options, or cancellation, timeout, HTTP availability failure or transport failure before any complete page. An invalid scope is returned as `scope: null`; provider data and arbitrary exception text are never returned.

A review contains only:

```ts
{
  id: 301,
  actorId: 201,
  state: "approved", // also changes_requested, commented, dismissed, pending
  commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  submittedAt: "2026-10-27T11:00:00.000Z"
}
```

Wire IDs must be original numeric tokens consisting of positive canonical integer digits, at most `Number.MAX_SAFE_INTEGER`. A scanner checks them before `JSON.parse` can round fractions or overflow. Exponent notation, fractional spelling, string IDs and duplicate decoded object keys (including escaped spellings) are rejected. Other provider fields are projected away. Multiple reviews by one actor are allowed; duplicate review IDs are not. Commits require 40 lowercase hexadecimal characters. UTC submission times accept seconds alone or one to three fractional digits and normalize to milliseconds; impossible dates, offsets, leap seconds and sub-millisecond precision are rejected. Missing/deleted actors and absent/null submission times produce incomplete observations, without invented identities or times. A pending review with an actual submission timestamp is retained as `pending`; no effective/latest-review semantics are inferred.

The exported `ReviewReason` union lists bounded machine-readable failure codes. Raw bodies, logins, tokens, headers, HTTP error messages and transport stacks are absent from results. Exported types also include `ReviewScope`, `ReviewObservation`, `ReviewRequest`, `ReviewResponse`, `ReviewTransport` and `ReviewResult`; exported `reviewLimits` and `reviewLimitations` describe fixed bounds and qualifications.

## Limits and limitations

- At most 10 pages, 100 reviews per page, 1 MiB actual bytes per page and 8 MiB aggregate bytes. Content-Length is not trusted; limits are checked before retaining each streamed chunk.
- At most 16,384 chunks per page (including empty chunks), 8,192 Link characters and JSON nesting depth 64. UTF-8 decoding is fatal. These extra structural limits bound pathological streams and ignored provider content.
- Whole-collection deadline defaults to 10 seconds; explicit integer values 1–60,000 ms are accepted. Transport promises and each body read race cancellation/deadline, elapsed time is checked between reads and before returning success, and failed bodies are cancelled without awaiting a possibly hung cancellation. JavaScript cannot preempt synchronously blocked code or force an uncooperative transport to stop its own work.
- Current head, reviewer roles, artifact binding, cross-page consistency and effective review state remain unverified. Collection can span changing provider pages. No observation proves a numeric repository identity, protected policy, membership or approval of a particular tarball.
- Saved or copied output is ordinary JSON and grants no authority. There is no host approval capability, role assignment, publication path or live-provider qualification in this package.

All local tests use in-memory fake transport fixtures. No live GitHub or credential behavior has been qualified.
