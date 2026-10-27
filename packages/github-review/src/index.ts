import {
  CollectionFailure,
  normalizeReview,
  parseOptions,
  parseScope,
  requireCondition,
  reviewLimitations,
  reviewLimits,
} from "./domain.ts";
import type {
  ReviewObservation,
  ReviewReason,
  ReviewResponse,
  ReviewResult,
  ReviewScope,
  ReviewTransport,
} from "./domain.ts";
import { parseReviewJson } from "./json.ts";
import { nextPage, pageUrl } from "./pagination.ts";
export { reviewLimitations, reviewLimits } from "./domain.ts";
export type {
  ReviewObservation,
  ReviewReason,
  ReviewRequest,
  ReviewResponse,
  ReviewResult,
  ReviewScope,
  ReviewTransport,
} from "./domain.ts";

/**
 * Collect only unverified source observations. The caller supplies the collection clock and
 * an explicit caller-supplied transport; this module performs no credential discovery or direct I/O.
 * The collector neither authenticates nor qualifies that transport.
 * timeoutMs is a deadline for the entire collection, including transport and all body reads.
 */
export async function collectGithubReviews(
  rawScope: unknown,
  transport: ReviewTransport,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ReviewResult> {
  const envelope = {
    schemaVersion: 1 as const,
    assurance: "unverified" as const,
    limitations: reviewLimitations,
  };
  let scope: ReviewScope;
  try {
    scope = parseScope(rawScope);
  } catch {
    return { ...envelope, status: "unavailable", scope: null, reasons: ["invalid_scope"] };
  }
  let validatedOptions: ReturnType<typeof parseOptions>;
  try {
    validatedOptions = parseOptions(options);
  } catch {
    return { ...envelope, status: "unavailable", scope, reasons: ["invalid_options"] };
  }
  const timeoutMs = validatedOptions.timeoutMs ?? reviewLimits.defaultTimeoutMs;
  const deadline = performance.now() + timeoutMs;
  const controller = new AbortController();
  let stoppedReason: ReviewReason | undefined;
  let stopPromise: (error: CollectionFailure) => void = () => {};
  const stopped = new Promise<never>((_resolve, reject) => {
    stopPromise = reject;
  });
  // Always observe rejection, including a signal already aborted before the first request.
  void stopped.catch(() => {});
  function stop(reason: "timeout" | "cancelled") {
    if (stoppedReason !== undefined) return;
    stoppedReason = reason;
    controller.abort();
    stopPromise(new CollectionFailure(reason, true));
  }
  const abort = () => stop("cancelled");
  validatedOptions.signal?.addEventListener("abort", abort, { once: true });
  if (validatedOptions.signal?.aborted) abort();
  const timer = setTimeout(() => stop("timeout"), timeoutMs);
  function checkDeadline() {
    if (performance.now() >= deadline) stop("timeout");
    if (stoppedReason !== undefined) throw new CollectionFailure(stoppedReason, true);
  }
  async function bounded<T>(work: () => Promise<T>): Promise<T> {
    checkDeadline();
    return Promise.race([Promise.resolve().then(work), stopped]);
  }
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: ReviewResponse | undefined;
  let completePages = 0;
  let phase: ReviewReason = "transport_unavailable";
  try {
    const pullUrl = `https://api.github.com/repos/${scope.owner}/${scope.repository}/pulls/${scope.pullRequest}`;
    const reviews: ReviewObservation[] = [];
    const identities = new Set<number>();
    let totalBytes = 0;
    let page: number | null = 1;
    while (page !== null) {
      requireCondition(page <= reviewLimits.pages, "page_limit");
      const url = pageUrl(pullUrl, page);
      phase = "transport_unavailable";
      response = await bounded(() =>
        transport(url, { method: "GET", redirect: "manual", signal: controller.signal }),
      );
      requireCondition(
        response.redirected === false &&
          response.url === url &&
          !(response.status >= 300 && response.status < 400),
        "unsafe_response",
      );
      if (response.status !== 200) {
        const statuses = new Map<number, ReviewReason>([
          [401, "unauthorized"],
          [403, "forbidden"],
          [404, "not_found"],
          [429, "rate_limited"],
        ]);
        throw new CollectionFailure(statuses.get(response.status) ?? "provider_unavailable", true);
      }
      const next = nextPage(response.headers.get("link"), pullUrl, page);
      phase = "body_unavailable";
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let pageBytes = 0;
      while (true) {
        const chunk = await bounded(() => reader!.read());
        if (chunk.done) break;
        requireCondition(chunk.value instanceof Uint8Array, "body_unavailable");
        requireCondition(chunks.length < reviewLimits.chunksPerPage, "body_chunks_limit");
        pageBytes += chunk.value.byteLength;
        totalBytes += chunk.value.byteLength;
        requireCondition(pageBytes <= reviewLimits.pageBytes, "page_bytes_limit");
        requireCondition(totalBytes <= reviewLimits.totalBytes, "total_bytes_limit");
        // Copy so a transport cannot mutate a retained chunk before parsing it.
        chunks.push(chunk.value.slice());
      }
      reader.releaseLock();
      reader = undefined;
      response = undefined;
      const bytes = new Uint8Array(pageBytes);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      phase = "malformed_json";
      const data = parseReviewJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      requireCondition(Array.isArray(data), "malformed_json");
      requireCondition(data.length <= reviewLimits.reviewsPerPage, "review_limit");
      phase = "invalid_review";
      for (const raw of data) {
        const review = normalizeReview(raw, pullUrl);
        requireCondition(!identities.has(review.id), "duplicate_review");
        identities.add(review.id);
        reviews.push(review);
      }
      completePages++;
      page = next;
    }
    checkDeadline();
    return { ...envelope, status: "complete", scope, reasons: [], reviews };
  } catch (error) {
    controller.abort();
    const failure =
      error instanceof CollectionFailure
        ? error
        : new CollectionFailure(phase, phase === "transport_unavailable");
    return {
      ...envelope,
      status: failure.unavailable && completePages === 0 ? "unavailable" : "incomplete",
      scope,
      reasons: [failure.reason],
    };
  } finally {
    clearTimeout(timer);
    validatedOptions.signal?.removeEventListener("abort", abort);
    // A malicious/failed transport may hang cancellation. Observe it, but never await it.
    const activeReader = reader;
    const activeResponse = response;
    if (activeReader)
      void Promise.resolve()
        .then(() => activeReader.cancel())
        .catch(() => {});
    else if (activeResponse)
      void Promise.resolve()
        .then(() => activeResponse.body.cancel())
        .catch(() => {});
  }
}
