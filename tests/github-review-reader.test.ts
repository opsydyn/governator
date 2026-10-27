import { afterEach, describe, expect, test, vi } from "vitest";
import { collectGithubReviews } from "../packages/github-review/src/index.ts";
import {
  fakeReviewTransport,
  githubReviewFixture,
  githubReviewPageUrl,
  githubReviewScope,
} from "./github-review-fixtures.ts";
import type { FakeReviewPage } from "./github-review-fixtures.ts";

const next = (page: number) => ({ link: `<${githubReviewPageUrl(page)}>; rel="next"` });
async function collect(page: FakeReviewPage = {}) {
  return collectGithubReviews(githubReviewScope, fakeReviewTransport([page]));
}
async function failure(page: FakeReviewPage, reason: string) {
  const result = await collect(page);
  expect(result.status).not.toBe("complete");
  expect(result.assurance).toBe("unverified");
  expect(result.reasons).toContain(reason);
  expect(result).not.toHaveProperty("reviews");
  return result;
}

afterEach(() => vi.restoreAllMocks());

describe("private GitHub review observations", () => {
  test("collects multiple pages without inventing approval, roles, head or effective state", async () => {
    const transport = vi.fn(
      fakeReviewTransport([
        { reviews: [githubReviewFixture()], headers: next(2) },
        { reviews: [githubReviewFixture({ id: 302, state: "COMMENTED" })] },
      ]),
    );
    expect(transport).not.toHaveBeenCalled();
    const result = await collectGithubReviews(githubReviewScope, transport);
    expect(result).toMatchObject({
      schemaVersion: 1,
      assurance: "unverified",
      status: "complete",
      reasons: [],
      scope: githubReviewScope,
    });
    if (result.status !== "complete") throw new Error("Expected complete observation");
    expect(result.reviews).toEqual([
      {
        id: 301,
        actorId: 201,
        state: "approved",
        commit: "a".repeat(40),
        submittedAt: "2026-10-27T11:00:00.000Z",
      },
      {
        id: 302,
        actorId: 201,
        state: "commented",
        commit: "a".repeat(40),
        submittedAt: "2026-10-27T11:00:00.000Z",
      },
    ]);
    expect(result.limitations).toEqual(
      expect.arrayContaining([
        "current_head_unverified",
        "reviewer_roles_unverified",
        "artifact_binding_unverified",
        "cross_page_consistency_unverified",
      ]),
    );
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      githubReviewPageUrl(),
      githubReviewPageUrl(2),
    ]);
    for (const [, request] of transport.mock.calls) {
      expect(request.method).toBe("GET");
      expect(request.redirect).toBe("manual");
      expect(request.signal).toBeInstanceOf(AbortSignal);
      expect(Object.keys(request).sort()).toEqual(["method", "redirect", "signal"]);
    }
  });
  test("empty provider listing with absent final Link is complete but unverified", async () => {
    const result = await collect();
    expect(result).toMatchObject({ status: "complete", assurance: "unverified", reviews: [] });
    expect(result.limitations).toContain("provider_reported_pagination_only");
  });
  test.each(["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED", "PENDING"])(
    "normalizes documented state %s",
    async (state) => {
      expect(await collect({ reviews: [githubReviewFixture({ state })] })).toMatchObject({
        status: "complete",
        reviews: [{ state: state.toLowerCase() }],
      });
    },
  );
  test.each(["", ".1", ".12", ".123"])("normalizes UTC fraction %s", async (fraction) => {
    expect(
      await collect({
        reviews: [githubReviewFixture({ submitted_at: `2026-10-27T11:00:00${fraction}Z` })],
      }),
    ).toMatchObject({
      status: "complete",
      reviews: [{ submittedAt: `2026-10-27T11:00:00.${fraction.slice(1).padEnd(3, "0")}Z` }],
    });
  });
  test("never invokes global fetch or discovers credentials", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("Forbidden network");
    });
    const result = await collect({ reviews: [githubReviewFixture()] });
    expect(result.status).toBe("complete");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("strict scope and wire validation", () => {
  test.each([
    { owner: ".." },
    { owner: "a/b" },
    { owner: "a%2Fb" },
    { owner: "a?b" },
    { owner: "a\\b" },
    { repository: "." },
    { repository: ".." },
    { repository: "a#b" },
    { repository: "a b" },
    { repository: "a".repeat(101) },
    { host: "elsewhere.example" },
    { pullRequest: 0 },
    { pullRequest: 1.2 },
    { pullRequest: Number.MAX_SAFE_INTEGER + 1 },
    { token: "secret" },
    { collectedAt: "2026-02-30T12:00:00.000Z" },
    { collectedAt: "2026-10-27T12:00:00Z" },
  ])("rejects unsafe or ambiguous scope %j before transport", async (change) => {
    const transport = vi.fn(fakeReviewTransport());
    expect(
      await collectGithubReviews({ ...githubReviewScope, ...change }, transport),
    ).toMatchObject({ status: "unavailable", reasons: ["invalid_scope"], scope: null });
    expect(transport).not.toHaveBeenCalled();
  });
  test.each([0, -1, 1.5, Infinity, 60001])(
    "rejects invalid timeout %s before transport",
    async (timeoutMs) => {
      const transport = vi.fn(fakeReviewTransport());
      expect(await collectGithubReviews(githubReviewScope, transport, { timeoutMs })).toMatchObject(
        { reasons: ["invalid_options"] },
      );
      expect(transport).not.toHaveBeenCalled();
    },
  );
  test.each([
    "2026-02-30T11:00:00Z",
    "2026-10-27T25:00:00Z",
    "2026-10-27T11:00:00.1234Z",
    "2026-10-27T11:00:00+00:00",
    "2026-10-27T11:00:60Z",
  ])("rejects timestamp %s", async (submitted_at) => {
    await failure({ reviews: [githubReviewFixture({ submitted_at })] }, "invalid_review");
  });
  test.each([
    { id: 0 },
    { id: "301" },
    { id: -1 },
    { id: 1.1 },
    { user: { id: 0 } },
    { commit_id: "a".repeat(39) },
    { state: "UNKNOWN" },
    { state: "approved" },
    { pull_request_url: "https://api.github.com/repos/example-org/other/pulls/17" },
    { pull_request_url: "https://evil.example/repos/example-org/design-system/pulls/17" },
  ])("rejects invalid required fields %j", async (change) => {
    await failure({ reviews: [githubReviewFixture(change)] }, "invalid_review");
  });
  test.each(["9007199254740991.2", "9007199254740992", "1e2", "301.0", "1e999"])(
    "rejects original numeric token %s in both identities",
    async (token) => {
      for (const field of ["review", "actor"]) {
        const raw = JSON.stringify([githubReviewFixture()]);
        const text =
          field === "review"
            ? raw.replace('"id":301', `"id":${token}`)
            : raw.replace('"id":201', `"id":${token}`);
        await failure({ text }, "invalid_review");
      }
    },
  );
  test("accepts MAX_SAFE_INTEGER wire identities exactly", async () => {
    expect(
      await collect({
        reviews: [
          githubReviewFixture({
            id: Number.MAX_SAFE_INTEGER,
            user: { id: Number.MAX_SAFE_INTEGER },
          }),
        ],
      }),
    ).toMatchObject({ status: "complete" });
  });
  test("rejects duplicate JSON keys including escaped spellings", async () => {
    for (const addition of ['"id":302,', '"\\u0069d":302,']) {
      const text = JSON.stringify([githubReviewFixture()]).replace(
        '"id":301,',
        `"id":301,${addition}`,
      );
      await failure({ text }, "malformed_json");
    }
  });
  test.each([null, {}, { id: null }])("missing/deleted actor %j is incomplete", async (user) => {
    await failure({ reviews: [githubReviewFixture({ user })] }, "missing_actor");
  });
  test.each([null, undefined])(
    "pending missing submission %s is incomplete",
    async (submitted_at) => {
      await failure(
        { reviews: [githubReviewFixture({ state: "PENDING", submitted_at })] },
        "missing_submission",
      );
    },
  );
  test.each(["{", "null", "{}", "[true]"])("rejects malformed/non-list data %s", async (text) => {
    const result = await collect({ text });
    expect(result.status).toBe("incomplete");
    expect(result).not.toHaveProperty("reviews");
  });
  test("ignores extra nested provider fields and absent optional PR URL", async () => {
    const item = githubReviewFixture({
      unexpected: { decimal: 0.25, text: "instructions are data" },
    });
    const { pull_request_url: _ignored, ...withoutUrl } = item;
    expect(await collect({ reviews: [withoutUrl] })).toMatchObject({ status: "complete" });
  });
  test("rejects duplicates on and across pages, discarding partial observations", async () => {
    await failure({ reviews: [githubReviewFixture(), githubReviewFixture()] }, "duplicate_review");
    const result = await collectGithubReviews(
      githubReviewScope,
      fakeReviewTransport([
        { reviews: [githubReviewFixture()], headers: next(2) },
        { reviews: [githubReviewFixture()] },
      ]),
    );
    expect(result).toMatchObject({ status: "incomplete", reasons: ["duplicate_review"] });
    expect(result).not.toHaveProperty("reviews");
  });
});

describe("bounded same-endpoint pagination and redirects", () => {
  test.each([
    githubReviewPageUrl(2).replace("api.github.com", "evil.example"),
    githubReviewPageUrl(2).replace("https:", "http:"),
    githubReviewPageUrl(2).replace("/reviews?", "/comments?"),
    githubReviewPageUrl(2).replace("pulls/17", "pulls/18"),
    githubReviewPageUrl(2).replace("per_page=100", "per_page=1"),
    `${githubReviewPageUrl(2)}&token=secret`,
    `${githubReviewPageUrl(2)}&page=3`,
    `${githubReviewPageUrl(2)}#fragment`,
    githubReviewPageUrl(2).replace("page=2", "page=02"),
    githubReviewPageUrl(2).replace("api.github.com", "user@api.github.com"),
    githubReviewPageUrl(3),
    githubReviewPageUrl(1),
    githubReviewPageUrl(2).replace("/repos/", "/ignored/../repos/"),
  ])("rejects unsafe/altered next URL %s before the next call", async (url) => {
    const transport = vi.fn(
      fakeReviewTransport([{ reviews: [], headers: { link: `<${url}>; rel="next"` } }]),
    );
    const result = await collectGithubReviews(githubReviewScope, transport);
    expect(result.status).toBe("incomplete");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  test.each([
    "",
    "garbage",
    `${next(2).link}, ${next(2).link}`,
    `<${githubReviewPageUrl(2)}>; rel="other"`,
  ])("rejects malformed or ambiguous Link %s", async (link) => {
    await failure({ headers: { link } }, "invalid_pagination");
  });
  test("accepts ordinary next/last/first/prev links and either query order", async () => {
    const result = await collectGithubReviews(
      githubReviewScope,
      fakeReviewTransport([
        {
          headers: {
            link: `<${githubReviewPageUrl(2).replace("per_page=100&page=2", "page=2&per_page=100")}>; rel="next", <${githubReviewPageUrl(2)}>; rel="last"`,
          },
        },
        {
          headers: {
            link: `<${githubReviewPageUrl(1)}>; rel="prev", <${githubReviewPageUrl(1)}>; rel="first"`,
          },
        },
      ]),
    );
    expect(result.status).toBe("complete");
  });
  test("rejects a last-page link proving more pages without next", async () =>
    failure(
      { headers: { link: `<${githubReviewPageUrl(2)}>; rel="last"` } },
      "invalid_pagination",
    ));
  test("rejects repeated pages after partial progress", async () => {
    const result = await collectGithubReviews(
      githubReviewScope,
      fakeReviewTransport([{ headers: next(2) }, { headers: next(2) }]),
    );
    expect(result).toMatchObject({ status: "incomplete", reasons: ["invalid_pagination"] });
  });
  test("caps at ten pages before an eleventh request", async () => {
    const transport = vi.fn(
      fakeReviewTransport(Array.from({ length: 10 }, (_, index) => ({ headers: next(index + 2) }))),
    );
    expect(await collectGithubReviews(githubReviewScope, transport)).toMatchObject({
      status: "incomplete",
      reasons: ["page_limit"],
    });
    expect(transport).toHaveBeenCalledTimes(10);
  });
  test.each([
    { redirected: true },
    { url: "https://evil.example/" },
    { url: githubReviewPageUrl(2) },
    { status: 302 },
    { status: 307 },
  ])("rejects redirect/final URL %j", async (page) => {
    await failure(page, "unsafe_response");
  });
});

describe("streaming budgets and cancellation", () => {
  test("caps review count at 100 per page", async () =>
    failure(
      { reviews: Array.from({ length: 101 }, (_, i) => githubReviewFixture({ id: i + 1 })) },
      "review_limit",
    ));
  test.each([{}, { "content-length": "1" }])(
    "limits actual streamed bytes despite headers %j",
    async (headers) => {
      let pulled = 0,
        cancelled = false;
      const body = new ReadableStream<Uint8Array>(
        {
          pull: function (controller) {
            pulled++;
            controller.enqueue(new Uint8Array(300_000));
          },
          cancel: function () {
            cancelled = true;
          },
        },
        { highWaterMark: 0 },
      );
      await failure({ body, headers }, "page_bytes_limit");
      expect(pulled).toBe(4);
      expect(cancelled).toBe(true);
    },
  );
  test("caps total streamed bytes at 8 MiB before parsing an oversized aggregate", async () => {
    const text = `[${JSON.stringify(githubReviewFixture({ body: "x".repeat(1_000_000) }))}]`;
    const transport = vi.fn(
      fakeReviewTransport(
        Array.from({ length: 9 }, (_, index) => ({
          text: text.replace('"id":301', `"id":${index + 1}`),
          headers: next(index + 2),
        })),
      ),
    );
    expect(await collectGithubReviews(githubReviewScope, transport)).toMatchObject({
      status: "incomplete",
      reasons: ["total_bytes_limit"],
    });
    expect(transport).toHaveBeenCalledTimes(9);
  });
  test("accepts JSON split across UTF-8 chunk boundaries", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify([githubReviewFixture({ body: "🧭" })]));
    expect(
      await collect({ chunks: Array.from(bytes, (byte) => new Uint8Array([byte])) }),
    ).toMatchObject({ status: "complete" });
  });
  test("rejects invalid UTF-8 rather than silently replacing it", async () =>
    failure({ chunks: [new Uint8Array([91, 34, 0xff, 34, 93])] }, "malformed_json"));
  test("pre-aborted signal never invokes transport and scrubs its reason", async () => {
    const signal = AbortSignal.abort("secret-token");
    const transport = vi.fn(fakeReviewTransport());
    const result = await collectGithubReviews(githubReviewScope, transport, { signal });
    expect(result.reasons).toEqual(["cancelled"]);
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(transport).not.toHaveBeenCalled();
  });
  test("deadline terminates a hung transport that ignores its signal", async () => {
    const transport = vi.fn(
      (_url: string, _request: { signal: AbortSignal }) => new Promise<never>(() => {}),
    );
    expect(
      await collectGithubReviews(githubReviewScope, transport, { timeoutMs: 15 }),
    ).toMatchObject({ reasons: ["timeout"] });
    expect(transport.mock.calls[0]?.[1].signal.aborted).toBe(true);
  });
  test("deadline terminates hung reads and never awaits a hung stream cancel", async () => {
    const cancel = vi.fn(() => new Promise<never>(() => {}));
    const body = new ReadableStream<Uint8Array>({
      pull: () => new Promise<never>(() => {}),
      cancel,
    });
    expect(
      await collectGithubReviews(githubReviewScope, fakeReviewTransport([{ body }]), {
        timeoutMs: 15,
      }),
    ).toMatchObject({ reasons: ["timeout"] });
    expect(cancel).toHaveBeenCalledOnce();
  });
  test("caller cancellation interrupts body reading and aborts transport signal", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          controller.abort("secret");
        },
      },
      { highWaterMark: 0 },
    );
    const transport = vi.fn(fakeReviewTransport([{ body }]));
    const result = await collectGithubReviews(githubReviewScope, transport, {
      signal: controller.signal,
    });
    expect(result.reasons).toEqual(["cancelled"]);
    expect(transport.mock.calls[0]?.[1].signal.aborted).toBe(true);
  });
  test("a stream error discards collected observations and provider text", async () => {
    const result = await collect({
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("secret-response-body"));
        },
      }),
    });
    expect(result.status).not.toBe("complete");
    expect(result).not.toHaveProperty("reviews");
    expect(JSON.stringify(result)).not.toContain("secret-response-body");
  });
});

describe("sanitized provider failure output", () => {
  test.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [429, "rate_limited"],
    [503, "provider_unavailable"],
  ] as const)("handles HTTP %s without reading error body", async (status, reason) => {
    const pull = vi.fn(() => new Promise<never>(() => {}));
    const body = new ReadableStream<Uint8Array>({ pull }, { highWaterMark: 0 });
    expect(await failure({ status, body }, reason)).toMatchObject({ status: "unavailable" });
    expect(pull).not.toHaveBeenCalled();
  });
  test("transport exception messages, stacks, body, logins and tokens never escape", async () => {
    const secret = "secret-token-provider-body";
    const thrown = await collectGithubReviews(githubReviewScope, () => {
      throw new Error(secret);
    });
    expect(thrown).toMatchObject({ status: "unavailable", reasons: ["transport_unavailable"] });
    expect(JSON.stringify(thrown)).not.toContain(secret);
    const complete = await collect({
      reviews: [
        githubReviewFixture({ body: secret, user: { id: 201, login: secret }, token: secret }),
      ],
      headers: { authorization: secret },
    });
    expect(complete.status).toBe("complete");
    expect(JSON.stringify(complete)).not.toContain(secret);
    expect(JSON.stringify(complete)).not.toContain('roles":');
  });
});

describe("runtime boundary validation", () => {
  test.each(
    [null, 42, "bad", [], { token: "secret" }, { signal: {} }, { signal: null }].map((raw) => [
      raw,
    ]),
  )("sanitizes invalid JS options %j before transport", async (raw) => {
    const transport = vi.fn(fakeReviewTransport());
    const result = await collectGithubReviews(
      githubReviewScope,
      transport,
      raw as Parameters<typeof collectGithubReviews>[2],
    );
    expect(result).toMatchObject({ status: "unavailable", reasons: ["invalid_options"] });
    expect(transport).not.toHaveBeenCalled();
  });
  test("scrubs throwing option getters and does not invoke transport", async () => {
    const transport = vi.fn(fakeReviewTransport());
    const options = {
      get timeoutMs(): number {
        throw new Error("secret getter");
      },
    };
    const result = await collectGithubReviews(githubReviewScope, transport, options);
    expect(result.reasons).toEqual(["invalid_options"]);
    expect(JSON.stringify(result)).not.toContain("secret getter");
    expect(transport).not.toHaveBeenCalled();
  });
  test("bounds streams of empty chunks that never finish", async () => {
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull: function (controller) {
          chunks++;
          if (chunks > 16_385) throw new Error("fixture emergency bound");
          controller.enqueue(new Uint8Array());
        },
      },
      { highWaterMark: 0 },
    );
    const result = await collect({ body });
    expect(result.reasons).toEqual(["body_chunks_limit"]);
    expect(chunks).toBeLessThanOrEqual(16_385);
  });
});

describe("provider URL spelling and JSON string boundaries", () => {
  test("accepts canonical GitHub capitalization of the same owner and repository", async () => {
    expect(
      await collect({
        reviews: [
          githubReviewFixture({
            pull_request_url: "https://api.github.com/repos/Example-Org/Design-System/pulls/17",
          }),
        ],
      }),
    ).toMatchObject({ status: "complete" });
  });
  test.each([
    "https://api.github.com/repos/example-org/design-system/pulls/017",
    "https://api.github.com/repos/example-org/design-system/pulls/17?token=secret",
    "https://api.github.com/repos/example-org/design-system/pulls/17#fragment",
    "https://user@api.github.com/repos/example-org/design-system/pulls/17",
    "https://api.github.com/repos/example-org/x/../design-system/pulls/17",
  ])("rejects noncanonical pull_request_url %s", async (pull_request_url) => {
    await failure({ reviews: [githubReviewFixture({ pull_request_url })] }, "invalid_review");
  });
  test("does not interpret number/key-looking text inside escaped strings", async () => {
    const body = 'text \\"id\\":9007199254740991.2,\\"user\\":{\\"id\\":1e9}\\\\\\"';
    const result = await collect({
      reviews: [githubReviewFixture({ body, extra: { id: 3.5, nested: [false, null, 1e9] } })],
    });
    expect(result.status).toBe("complete");
    expect(JSON.stringify(result)).not.toContain(body);
  });
  test("bounds deeply nested ignored provider content", async () => {
    const text = JSON.stringify([githubReviewFixture()]).replace(
      '"body":"ignored editable provider text"',
      `"body":${"[".repeat(65)}null${"]".repeat(65)}`,
    );
    await failure({ text }, "malformed_json");
  });
});

describe("deadline and cancellation across asynchronous boundaries", () => {
  test("checks elapsed time even when transport blocks timers before resolving", async () => {
    const fake = fakeReviewTransport();
    const transport = (url: string, request: Parameters<typeof fake>[1]) =>
      fakeAfterStall(fake, url, request);
    const result = await collectGithubReviews(githubReviewScope, transport, { timeoutMs: 5 });
    expect(result.reasons).toEqual(["timeout"]);
  });
  test("caller cancellation terminates a hung transport independently of timeout", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5);
    const result = await collectGithubReviews(
      githubReviewScope,
      () => new Promise<never>(() => {}),
      { signal: controller.signal, timeoutMs: 1000 },
    );
    clearTimeout(timer);
    expect(result.reasons).toEqual(["cancelled"]);
  });
});

function fakeAfterStall(
  fake: ReturnType<typeof fakeReviewTransport>,
  url: string,
  request: Parameters<typeof fake>[1],
) {
  const start = performance.now();
  while (performance.now() - start < 20) {
    /* bounded fixture stall */
  }
  return fake(url, request);
}

describe("native caller signal boundary", () => {
  test.each(["addEventListener", "aborted", "removeEventListener"] as const)(
    "sanitizes throwing signal %s getter before any transport call",
    async (property) => {
      const signal = new AbortController().signal;
      Object.defineProperty(signal, property, {
        get() {
          throw new Error("fixture-secret");
        },
      });
      const transport = vi.fn(fakeReviewTransport());
      const result = await collectGithubReviews(githubReviewScope, transport, { signal });
      expect(result).toMatchObject({ status: "unavailable", reasons: ["invalid_options"] });
      expect(JSON.stringify(result)).not.toContain("fixture-secret");
      expect(transport).not.toHaveBeenCalled();
    },
  );
  test("late removeEventListener getter cannot replace a successful result", async () => {
    const signal = new AbortController().signal;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          Object.defineProperty(signal, "removeEventListener", {
            get() {
              throw new Error("fixture-secret");
            },
          });
          controller.enqueue(new TextEncoder().encode("[]"));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const result = await collectGithubReviews(githubReviewScope, fakeReviewTransport([{ body }]), {
      signal,
    });
    expect(result.status).toBe("complete");
  });
  test("late signal overrides cannot prevent native cancellation or escape cleanup", async () => {
    const caller = new AbortController();
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          for (const property of ["addEventListener", "aborted", "removeEventListener"]) {
            Object.defineProperty(caller.signal, property, {
              get() {
                throw new Error("fixture-secret");
              },
            });
          }
          caller.abort("fixture-secret");
        },
      },
      { highWaterMark: 0 },
    );
    const result = await collectGithubReviews(githubReviewScope, fakeReviewTransport([{ body }]), {
      signal: caller.signal,
    });
    expect(result.reasons).toEqual(["cancelled"]);
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
  });
  test("rejects a prototype-only AbortSignal before transport", async () => {
    const signal = Object.create(AbortSignal.prototype) as AbortSignal;
    const transport = vi.fn(fakeReviewTransport());
    const result = await collectGithubReviews(githubReviewScope, transport, { signal });
    expect(result.reasons).toEqual(["invalid_options"]);
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("intrinsic streamed byte measurement and snapshots", () => {
  test("snapshots Buffer bytes before later stream pulls can reuse and mutate them", async () => {
    const chunk = Buffer.from(JSON.stringify([githubReviewFixture()]));
    const originalIndex = chunk.indexOf('"id":301');
    let reads = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          reads++;
          if (reads === 1) controller.enqueue(chunk);
          else {
            chunk.write('"id":302', originalIndex);
            controller.close();
          }
        },
      },
      { highWaterMark: 0 },
    );
    const result = await collect({ body });
    expect(result).toMatchObject({ status: "complete", reviews: [{ id: 301 }] });
  });
  test("counts an oversized typed-array view intrinsically despite shadowed byteLength", async () => {
    const chunk = new Uint8Array(1_048_577);
    Object.defineProperty(chunk, "byteLength", { value: 1 });
    await failure({ chunks: [chunk] }, "page_bytes_limit");
  });
  test("counts only a small view into a larger backing buffer", async () => {
    const backing = new Uint8Array(2_097_152);
    const bytes = new TextEncoder().encode(JSON.stringify([githubReviewFixture()]));
    backing.set(bytes, 100);
    const view = backing.subarray(100, 100 + bytes.byteLength);
    expect(await collect({ chunks: [view] })).toMatchObject({
      status: "complete",
      reviews: [{ id: 301 }],
    });
  });
  test("copies typed-array bytes without dispatching shadowed slice, iterator or length accessors", async () => {
    const chunk = new TextEncoder().encode(JSON.stringify([githubReviewFixture()]));
    for (const property of [
      "slice",
      "byteLength",
      "length",
      "buffer",
      "byteOffset",
      Symbol.iterator,
    ]) {
      Object.defineProperty(chunk, property, {
        get() {
          throw new Error("fixture-secret");
        },
      });
    }
    expect(await collect({ chunks: [chunk] })).toMatchObject({
      status: "complete",
      reviews: [{ id: 301 }],
    });
  });
  test("ignores a Uint8Array subclass's slice, iterator and species overrides", async () => {
    const ordinary = new TextEncoder().encode(JSON.stringify([githubReviewFixture()]));
    const chunk = new HostileReviewChunk(ordinary);
    expect(await collect({ chunks: [chunk] })).toMatchObject({
      status: "complete",
      reviews: [{ id: 301 }],
    });
  });
});

class HostileReviewChunk extends Uint8Array {
  override slice(): Uint8Array<ArrayBuffer> {
    throw new Error("fixture-secret slice");
  }
  override [Symbol.iterator](): ArrayIterator<number> {
    throw new Error("fixture-secret iterator");
  }
  static get [Symbol.species]() {
    throw new Error("fixture-secret species");
  }
}
