import {
  CollectionFailure,
  collectionFailureDetails,
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

// Capture platform intrinsics once. Caller objects may shadow methods/getters or mutate them
// after validation; byte views may be Buffers or subclasses with aliasing slice implementations.
const nativeSignalAborted: (this: AbortSignal) => boolean = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
)!.get!;
const nativeAddEventListener = EventTarget.prototype.addEventListener;
const nativeRemoveEventListener = EventTarget.prototype.removeEventListener;
const nativeByteLength: (this: Uint8Array) => number = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  "byteLength",
)!.get!;
const nativeSetBytes = Uint8Array.prototype.set;

// Foreign callbacks/getters never select internal reason codes, even if they throw an actual
// CollectionFailure imported from an internal module. Do not inspect the thrown value at all.
function foreign<T>(reason: ReviewReason, work: () => T): T {
  try {
    return work();
  } catch {
    throw new CollectionFailure(reason);
  }
}
async function foreignAsync<T>(
  reason: ReviewReason,
  work: () => Promise<T>,
  unavailable = false,
): Promise<T> {
  try {
    return await work();
  } catch {
    throw new CollectionFailure(reason, unavailable);
  }
}

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
    const signal = validatedOptions.signal;
    if (signal !== undefined) {
      // Brand-check through the native getter, then reject customized hooks during setup.
      // Property reads stay inside this sanitized boundary; none are reused later.
      const aborted = nativeSignalAborted.call(signal);
      requireCondition(
        signal.addEventListener === nativeAddEventListener &&
          signal.removeEventListener === nativeRemoveEventListener &&
          signal.aborted === aborted,
        "invalid_options",
      );
    }
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
  const callerSignal = validatedOptions.signal;
  function removeCallerAbort() {
    if (callerSignal !== undefined) {
      try {
        nativeRemoveEventListener.call(callerSignal, "abort", abort);
      } catch {
        // Cleanup must never replace a sanitized result with a caller-controlled exception.
      }
    }
  }
  try {
    if (callerSignal !== undefined) {
      nativeAddEventListener.call(callerSignal, "abort", abort, { once: true });
      if (nativeSignalAborted.call(callerSignal)) abort();
    }
  } catch {
    removeCallerAbort();
    return { ...envelope, status: "unavailable", scope, reasons: ["invalid_options"] };
  }
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
        foreignAsync(
          "transport_unavailable",
          () => transport(url, { method: "GET", redirect: "manual", signal: controller.signal }),
          true,
        ),
      );
      phase = "unsafe_response";
      const metadata = foreign("unsafe_response", () => ({
        status: response!.status,
        redirected: response!.redirected,
        url: response!.url,
      }));
      requireCondition(
        Number.isInteger(metadata.status) &&
          metadata.redirected === false &&
          metadata.url === url &&
          !(metadata.status >= 300 && metadata.status < 400),
        "unsafe_response",
      );
      if (metadata.status !== 200) {
        const statuses = new Map<number, ReviewReason>([
          [401, "unauthorized"],
          [403, "forbidden"],
          [404, "not_found"],
          [429, "rate_limited"],
        ]);
        throw new CollectionFailure(statuses.get(metadata.status) ?? "provider_unavailable", true);
      }
      phase = "invalid_pagination";
      const link = foreign("invalid_pagination", () => response!.headers.get("link"));
      const next = nextPage(link, pullUrl, page);
      phase = "body_unavailable";
      reader = foreign("body_unavailable", () => response!.body.getReader());
      const chunks: Uint8Array[] = [];
      let pageBytes = 0;
      while (true) {
        const chunk = await bounded(() => foreignAsync("body_unavailable", () => reader!.read()));
        const done = foreign("body_unavailable", () => chunk.done);
        requireCondition(done === true || done === false, "body_unavailable");
        if (done) break;
        const value = foreign("body_unavailable", () => chunk.value);
        requireCondition(value !== undefined, "body_unavailable");
        requireCondition(
          foreign("body_unavailable", () => value instanceof Uint8Array),
          "body_unavailable",
        );
        requireCondition(chunks.length < reviewLimits.chunksPerPage, "body_chunks_limit");
        const byteLength = foreign("body_unavailable", () => nativeByteLength.call(value));
        pageBytes += byteLength;
        totalBytes += byteLength;
        requireCondition(pageBytes <= reviewLimits.pageBytes, "page_bytes_limit");
        requireCondition(totalBytes <= reviewLimits.totalBytes, "total_bytes_limit");
        // Intrinsic set reads TypedArray internal slots, bypassing slice/species/iterators and
        // shadowed properties. Always allocate an ordinary, independent view AFTER budget checks.
        const snapshot = new Uint8Array(byteLength);
        foreign("body_unavailable", () => nativeSetBytes.call(snapshot, value));
        chunks.push(snapshot);
      }
      foreign("body_unavailable", () => reader!.releaseLock());
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
    const failure = collectionFailureDetails(error) ?? {
      reason: phase,
      unavailable: phase === "transport_unavailable",
    };
    return {
      ...envelope,
      status: failure.unavailable && completePages === 0 ? "unavailable" : "incomplete",
      scope,
      reasons: [failure.reason],
    };
  } finally {
    clearTimeout(timer);
    removeCallerAbort();
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
