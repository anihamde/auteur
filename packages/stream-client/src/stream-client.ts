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
};

/**
 * How many consecutive reconnects that deliver nothing before giving up.
 *
 * Bounded on *empty* reconnects rather than on total attempts, because a stream
 * that reconnects every four minutes and delivers a stage each time is working
 * — that is the ordinary case now, not the exceptional one, since the function
 * ceiling ends every long run's stream. What is not working is reconnecting
 * into silence.
 */
export const MAX_EMPTY_RECONNECTS = 5;

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

export const connectStream = (config: StreamConfig): Stream => {
  const call = config.fetch ?? globalThis.fetch;
  const sleep = config.sleep ?? ((ms: number) => Bun.sleep(ms));
  const maxEmpty = config.maxEmptyReconnects ?? MAX_EMPTY_RECONNECTS;

  let cursor = 0;
  let closed = false;
  let controller = new AbortController();

  const fatal = (error: AuteurError): void => {
    closed = true;
    controller.abort();
    config.onFatal(error);
  };

  const readOnce = async (): Promise<number> => {
    controller = new AbortController();
    const url = new URL(config.url);
    url.searchParams.set("cursor", cursor.toString());

    const response = await call(url.toString(), {
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
    let delivered = 0;

    for (;;) {
      const { done, value } = await reader.read();
      // `close()` aborts the request, but a response already in hand keeps
      // reading: an abort races the bytes rather than unwinding them. Nothing
      // is delivered to a consumer that has stopped listening.
      if (done || closed) break;
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
    return delivered;
  };

  const done = (async (): Promise<void> => {
    let empty = 0;
    while (!closed) {
      try {
        const delivered = await readOnce();
        if (closed) return;
        empty = delivered > 0 ? 0 : empty + 1;
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
        empty += 1;
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
