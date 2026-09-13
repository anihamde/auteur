import type { Fetch } from "@auteur/api-contract/transport";
import { type StoredEvent, storedEventSchema } from "@auteur/core/events";
import { AuteurError } from "@auteur/errors/auteur-error";

/**
 * The SSE consumer: cursor, replay, de-duplicate, reconnect.
 *
 * `ARCHITECTURE.md` §7.3's failure table, as behaviour. The whole design rests
 * on one asymmetry: **the durable log is the truth and the stream is a
 * convenience.** Every event is appended before it is pushed, so anything the
 * stream drops is still in the table — and the only thing this client has to
 * get right is never advancing its cursor past something it did not deliver.
 *
 * Which is why `close()` is idempotent and why an unparseable frame is fatal:
 * reconnecting from the same cursor refetches the same bad frame forever, and a
 * client that keeps trying is a client that never tells anyone.
 */

export type StreamConfig = {
  readonly url: string;
  /** Injected so every test runs offline. */
  readonly fetch?: Fetch;
  readonly onEvent: (event: StoredEvent) => void;
  readonly onFatal: (error: AuteurError) => void;
  /** Injected so a test does not wait through the backoff. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly maxEmptyReconnects?: number;
  /**
   * Where to resume from. Defaults to 0 — the beginning.
   *
   * A reload knows its cursor: the session view it just fetched carries the
   * events it already has. Without this the client would replay the whole log
   * on every reload and then drop most of it as at-or-below-cursor, which
   * works and costs a session's entire event history on the wire.
   */
  readonly startCursor?: number;
};

/**
 * How many consecutive **short** reconnects that deliver nothing before giving
 * up.
 *
 * Bounded on empty reconnects rather than on total attempts, because a stream
 * that reconnects every minute and delivers a stage each time is working — that
 * is the ordinary case, not the exceptional one, since the function ceiling
 * ends every long run's stream.
 *
 * And bounded on **short** ones, which is the half that was missing. A
 * connection that stayed open for its whole budget and delivered nothing is an
 * idle stream over a quiet pipeline, which is most of a research stage: the
 * card took three and a half minutes on the deployment and said nothing for
 * most of it. Counting those, five of them ended the stream for good — after
 * which every screen needed a manual reload, and `onFatal` was a no-op so
 * nothing said why.
 *
 * What is not working is reconnecting into an endpoint that answers at once
 * with nothing, five times over.
 */
export const MAX_EMPTY_RECONNECTS = 5;

/**
 * A connection is healthy if it **received anything at all**.
 *
 * Not "if it lasted a while": the route holds every connection open for its
 * whole budget whether or not anything is appended, so elapsed time is the same
 * fifty seconds on a working stream and on one talking to a route that will
 * never say anything. What tells them apart is bytes — the route sends a
 * heartbeat comment frame on every poll, so a live connection is never silent
 * even while the pipeline is.
 *
 * An endpoint that is not there sends nothing, and five of those in a row is
 * the condition the budget is for.
 */

const BACKOFF_MS = [250, 500, 1000, 2000, 4000] as const;

export type Stream = {
  /** Idempotent: aborts the in-flight request and stops reconnecting. */
  readonly close: () => void;
  /** The highest seq delivered. What a reconnect resumes from. */
  readonly cursor: () => number;
  /** Resolves when the stream ends for good. */
  readonly done: Promise<void>;
};

/** One `data:` line, parsed. */
const parseFrame = (data: string): StoredEvent => {
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch (cause) {
    throw new AuteurError(
      "internal",
      "The stream sent a frame that is not JSON.",
      {
        cause,
      },
    );
  }
  // No date massaging here: `storedEventSchema` coerces, so the same schema
  // reads a row from the database and a frame off the wire.
  const parsed = storedEventSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AuteurError(
      "internal",
      "The stream sent a frame this client cannot read.",
      { detail: { issues: parsed.error.issues } },
    );
  }
  return parsed.data;
};

/**
 * Split a chunk into complete SSE frames, keeping the remainder.
 *
 * A frame split across two reads is the ordinary case on a real socket, and a
 * parser that assumed whole frames would pass a neater test and fail in
 * production.
 */
export const splitFrames = (
  buffer: string,
): { frames: string[]; rest: string } => {
  const parts = buffer.split("\n\n");
  return { frames: parts.slice(0, -1), rest: parts.at(-1) ?? "" };
};

const dataOf = (frame: string): string | undefined => {
  const lines = frame.split("\n").filter((line) => line.startsWith("data:"));
  if (lines.length === 0) return undefined;
  return lines.map((line) => line.slice(5).trim()).join("");
};

/**
 * Set the cursor on a URL that may be relative.
 *
 * `config.url` is same-origin on the deployment — the client and the routes are
 * one project — and `new URL("/api/sessions/x/events")` throws without a base.
 * The reconnect loop rewrites the cursor on every read, so it has to *replace*
 * an existing one rather than append a second.
 */
export const withCursor = (url: string, cursor: number): string => {
  const [path = "", search = ""] = url.split("?");
  const params = new URLSearchParams(search);
  params.set("cursor", cursor.toString());
  return `${path}?${params.toString()}`;
};

export const connectStream = (config: StreamConfig): Stream => {
  const call = config.fetch ?? globalThis.fetch;
  // `setTimeout`, not `Bun.sleep`. This module ships to the browser, where
  // `Bun` is as undefined as it is on Node — and every test injects a `sleep`,
  // so nothing here ever ran the default. On the deployment the first reconnect
  // threw `ReferenceError` inside an IIFE nobody awaits: the loop was gone, the
  // stream never came back, and `onFatal` never fired to say so. Gate 16 now
  // walks the client bundle for exactly this.
  const sleep =
    config.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));
  const maxEmpty = config.maxEmptyReconnects ?? MAX_EMPTY_RECONNECTS;

  let cursor = config.startCursor ?? 0;
  let closed = false;
  let controller = new AbortController();

  const fatal = (error: AuteurError): void => {
    closed = true;
    controller.abort();
    config.onFatal(error);
  };

  /**
   * What the connection in flight has seen.
   *
   * Read by the loop's `catch` as well as its success arm: a connection torn
   * after delivering thirty events is not an empty reconnect, and counting it
   * as one ended a working stream after six tears.
   */
  let delivered = 0;
  let received = 0;

  const readOnce = async (): Promise<void> => {
    delivered = 0;
    received = 0;
    controller = new AbortController();
    const response = await call(withCursor(config.url, cursor), {
      signal: controller.signal,
    });

    if (response.status === 404) {
      // Fatal at once. The session is gone, and every reconnect would ask the
      // same question and get the same answer.
      throw new AuteurError("not_found", "This session no longer exists.");
    }
    if (!response.ok || response.body === null) {
      throw new AuteurError("internal", "The event stream could not be read.", {
        detail: { status: response.status },
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      // `close()` aborts the request, but a response already in hand keeps
      // reading: an abort races the bytes rather than unwinding them. Nothing
      // is delivered to a consumer that has stopped listening.
      if (done || closed) break;
      // Any bytes at all, comment frames included. This is what says the
      // connection is alive while the pipeline is quiet.
      received += value.length;
      buffer += decoder.decode(value, { stream: true });
      const { frames, rest } = splitFrames(buffer);
      buffer = rest;

      for (const frame of frames) {
        const data = dataOf(frame);
        if (data === undefined || data.length === 0) continue;
        // Throws, and the caller does not retry: reconnecting from the same
        // cursor refetches the same bad frame forever.
        const event = parseFrame(data);
        // Drop anything at or below the cursor. The server may replay from the
        // cursor or after it, and the client is what makes delivery
        // exactly-once either way.
        if (event.seq <= cursor) continue;
        cursor = event.seq;
        delivered += 1;
        config.onEvent(event);
      }
    }
  };

  const done = (async (): Promise<void> => {
    let empty = 0;
    while (!closed) {
      try {
        await readOnce();
        if (closed) return;
        // A connection that received bytes is alive, whether or not any of them
        // were events. Only silence counts.
        empty = delivered > 0 || received > 0 ? 0 : empty + 1;
        if (empty > maxEmpty) {
          fatal(
            new AuteurError(
              "internal",
              "The event stream reconnected repeatedly and delivered nothing.",
            ),
          );
          return;
        }
      } catch (thrown) {
        if (closed) return;
        if (thrown instanceof AuteurError) {
          // A 404 and an unparseable frame are both fatal at once: neither
          // becomes true by asking again.
          fatal(thrown);
          return;
        }
        // Same rule on the torn path. A connection that delivered thirty
        // events and was then cut is not an empty reconnect.
        empty = delivered > 0 || received > 0 ? 0 : empty + 1;
        if (empty > maxEmpty) {
          fatal(
            new AuteurError(
              "internal",
              "The event stream could not be kept open.",
            ),
          );
          return;
        }
      }
      await sleep(BACKOFF_MS[Math.min(empty, BACKOFF_MS.length - 1)] ?? 4000);
    }
  })();

  return {
    close: () => {
      if (closed) return;
      closed = true;
      controller.abort();
    },
    cursor: () => cursor,
    done,
  };
};
