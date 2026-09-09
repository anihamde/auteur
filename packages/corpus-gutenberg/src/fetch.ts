import { AuteurError } from "@auteur/errors/auteur-error";
import { cleanGutenberg } from "@auteur/text/clean";
import { countWords } from "@auteur/text/tokenize";
import { cleanerVersion } from "@auteur/text/version";
import type { FetchLike } from "./gutendex.ts";
import type { GutendexBook } from "./schema.ts";

/**
 * Fetching and cleaning a work's text.
 *
 * gutendex is a free public service and this is a single-user application, so
 * the budget is **politeness rather than throughput**: at most four concurrent
 * requests, one retry on a 5xx or a timeout at 2s then 4s, and no retry on a
 * 4xx (`ARCHITECTURE.md` §5.4). A 4xx will not become a 2xx by asking again,
 * and retrying one is how a client turns its own bug into someone else's load.
 */

export const MAX_CONCURRENCY = 4;
export const RETRY_DELAYS_MS = [2000, 4000] as const;

/**
 * The plain-text format, UTF-8 preferred.
 *
 * A book offering no plain-text format is **dropped from selection, not fetched
 * as HTML**. Stripping Gutenberg's HTML is a second cleaner with a second set
 * of failure modes, for no gain while the plain-text corpus is this large — and
 * a measurement taken over markup that leaked through is worse than a missing
 * work, because nothing about it looks wrong.
 */
export const plainTextUrl = (book: GutendexBook): string | undefined => {
  const entries = Object.entries(book.formats).filter(([type]) =>
    type.startsWith("text/plain"),
  );
  const utf8 = entries.find(([type]) => /utf-?8/i.test(type));
  return (utf8 ?? entries[0])?.[1];
};

export type FetchedWork = {
  readonly id: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly translator: string | null;
  readonly cleanerVersion: string;
  readonly wordCount: number;
  readonly text: string;
};

const isRetryable = (status: number): boolean => status >= 500;

/** Injected so a test can assert the backoff without waiting eight seconds. */
export type FetchTextConfig = {
  readonly fetch?: FetchLike;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly signal?: AbortSignal;
};

/**
 * One work: fetch, retry once on a 5xx or a timeout, clean, count.
 *
 * The cleaner runs here rather than at the store, because `works` is keyed on
 * `(source_url, cleaner_version)` and the version has to be the one that
 * actually produced the stored text. Cleaning later would let a row be written
 * under a version it was not cleaned by.
 */
export const fetchWork = async (
  book: GutendexBook,
  config: FetchTextConfig = {},
): Promise<FetchedWork> => {
  const url = plainTextUrl(book);
  if (url === undefined) {
    throw new AuteurError(
      "corpus_unusable",
      `${book.title} offers no plain-text format.`,
      { detail: { bookId: book.id } },
    );
  }

  const call = config.fetch ?? fetch;
  const sleep =
    config.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));
  let lastProblem: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 0);
    }
    try {
      const response = await call(url, {
        ...(config.signal !== undefined && { signal: config.signal }),
      });
      if (response.ok) {
        const raw = await response.text();
        // Throws `corpus_unusable` when the Gutenberg markers are absent —
        // §4.2. A file without them is not a Gutenberg text, and measuring the
        // licence boilerplate as prose is the failure that looks like a result.
        const text = cleanGutenberg(raw, url);
        return {
          cleanerVersion: cleanerVersion(),
          id: `${"gutenberg"}:${book.id.toString()}`,
          sourceUrl: url,
          text,
          title: book.title,
          translator: book.translators[0]?.name ?? null,
          wordCount: countWords(text),
        };
      }
      if (!isRetryable(response.status)) {
        throw new AuteurError(
          "corpus_unavailable",
          `${book.title} could not be fetched.`,
          { detail: { status: response.status, url } },
        );
      }
      lastProblem = new AuteurError(
        "corpus_unavailable",
        `${book.title} could not be fetched.`,
        { detail: { status: response.status, url } },
      );
    } catch (cause) {
      // A `corpus_unusable` is the cleaner's verdict on text that arrived
      // intact. Retrying would fetch the same bytes and reach the same verdict.
      if (cause instanceof AuteurError && cause.code === "corpus_unusable") {
        throw cause;
      }
      if (cause instanceof AuteurError && cause.code === "corpus_unavailable") {
        const status = (cause.detail as { status?: number } | undefined)
          ?.status;
        if (status !== undefined && !isRetryable(status)) throw cause;
      }
      lastProblem = cause;
    }
  }

  throw lastProblem instanceof AuteurError
    ? lastProblem
    : new AuteurError(
        "corpus_unavailable",
        `${book.title} could not be fetched.`,
        { cause: lastProblem, detail: { url } },
      );
};

export type FetchOutcome =
  | { readonly ok: true; readonly work: FetchedWork }
  | {
      readonly ok: false;
      readonly bookId: number;
      readonly title: string;
      readonly reason: string;
    };

/**
 * Fetch many works, at most four at a time.
 *
 * **A work that fails is dropped, not thrown** (§5.4): the card is built from
 * the rest, `cardStrength` shows the shortfall, and the stage emits a detail
 * line naming what was lost. The caller refuses only when zero works fetched,
 * which is an error rather than a low-confidence card.
 *
 * The pool is a fixed number of workers pulling from a shared cursor rather
 * than a chunked `Promise.all`. Chunking waits for the slowest member of each
 * chunk before starting the next, so one 30-second work stalls three idle
 * slots — and Gutenberg's texts vary by two orders of magnitude in size.
 */
export const fetchWorks = async (
  books: readonly GutendexBook[],
  config: FetchTextConfig = {},
  concurrency = MAX_CONCURRENCY,
): Promise<FetchOutcome[]> => {
  const outcomes: FetchOutcome[] = Array.from({ length: books.length });
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const book = books[index];
      if (book === undefined) return;
      try {
        outcomes[index] = { ok: true, work: await fetchWork(book, config) };
      } catch (cause) {
        outcomes[index] = {
          bookId: book.id,
          ok: false,
          reason:
            cause instanceof Error ? cause.message : "could not be fetched",
          title: book.title,
        };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, books.length) }, worker),
  );
  return outcomes;
};
