import type {
  ReviewResponse,
  ReviewScope,
  ReviewTransport,
} from "../packages/github-review/src/index.ts";

export const githubReviewScope: ReviewScope = {
  host: "github.com",
  owner: "example-org",
  repository: "design-system",
  pullRequest: 17,
  collectedAt: "2026-10-27T12:00:00.000Z",
};

export function githubReviewFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 301,
    user: { id: 201, login: "ignored-login" },
    state: "APPROVED",
    commit_id: "a".repeat(40),
    submitted_at: "2026-10-27T11:00:00Z",
    pull_request_url: "https://api.github.com/repos/example-org/design-system/pulls/17",
    body: "ignored editable provider text",
    ...overrides,
  };
}

export type FakeReviewPage = {
  reviews?: unknown;
  text?: string;
  chunks?: readonly Uint8Array[];
  body?: ReadableStream<Uint8Array>;
  status?: number;
  headers?: Record<string, string>;
  url?: string;
  redirected?: boolean;
};

/** In-memory bytes only; no fetch, credential lookup or implicit collector invocation. */
export function fakeReviewTransport(
  pages: readonly FakeReviewPage[] = [{ reviews: [githubReviewFixture()] }],
): ReviewTransport {
  let index = 0;
  return (url, _request) => {
    const page = pages[index++];
    if (!page) throw new Error("No fake review page");
    const chunks = page.chunks ?? [
      new TextEncoder().encode(page.text ?? JSON.stringify(page.reviews ?? [])),
    ];
    const response: ReviewResponse = {
      status: page.status ?? 200,
      headers: new Headers(page.headers),
      url: page.url ?? url,
      redirected: page.redirected ?? false,
      body:
        page.body ??
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          },
        }),
    };
    return Promise.resolve(response);
  };
}

export function githubReviewPageUrl(page = 1): string {
  return `https://api.github.com/repos/example-org/design-system/pulls/17/reviews?per_page=100&page=${page}`;
}
