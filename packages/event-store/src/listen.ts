import type { Db } from "@auteur/db/db";
import { identifier } from "@auteur/db/sql";
import { channelFor } from "./events.ts";

/**
 * Waiting on a session's channel, on a dedicated connection.
 *
 * `LISTEN` is a session-level feature of the Postgres protocol: it binds to the
 * connection, and a pooled connection lends that connection to someone else
 * between statements. Through pooled-mode PgBouncer the `LISTEN` is accepted
 * and then simply never delivers, which is why `@auteur/db` refuses `connect()`
 * on a pooled handle rather than trusting the caller to remember.
 *
 * The notification payload carries only `{ sessionId, seq }`. The event itself
 * is read from the table — a payload has a size limit, and more importantly the
 * table is the source of truth for replay, so a stream that rendered the
 * notification's contents would be able to show something a reconnect could
 * not.
 */

/**
 * How long a lost connection is given to close before the release goes ahead.
 *
 * Long enough for an ordinary socket teardown, short enough that a stream's
 * `finally` never becomes the reason an invocation is killed.
 */
export const END_TIMEOUT_MS = 1000;

export type Subscription = {
  /** Stops listening and returns the connection to the pool. */
  readonly close: () => Promise<void>;
  /**
   * True once the connection was lost rather than closed.
   *
   * The stream does not have to do anything about it — the table is the source
   * of truth and the reader's poll keeps working — but a caller that wants to
   * end early rather than poll to its budget can ask.
   */
  readonly lost: () => boolean;
};

/**
 * Call `onSeq` whenever an event lands for `sessionId`.
 *
 * The connection is dedicated for the subscription's life. That is the cost of
 * `LISTEN`, and it is the reason `ARCHITECTURE.md` §7 puts the stream route on
 * the direct endpoint and everything else on the pooled one.
 */
export const subscribe = async (
  db: Db,
  sessionId: string,
  onSeq: (seq: number) => void,
): Promise<Subscription> => {
  const channel = channelFor(sessionId);
  const client = await db.connect();
  let closed = false;
  let released = false;
  let lost = false;

  /**
   * Hand the connection back exactly once.
   *
   * Separate from `closed` because the two answer different questions — "has
   * anyone asked this to stop" and "has the pool got its connection back" — and
   * conflating them loses the slot. `close()` sets `closed` before awaiting
   * `UNLISTEN`, so a backend dying during that round trip reached an error
   * listener that saw `closed` and returned without releasing, while the
   * rejected `UNLISTEN` threw past the release below. The client stayed checked
   * out for the life of the process, and four of those empty a direct pool.
   *
   * `release(cause)` destroys the connection rather than returning it, so the
   * next subscriber opens a new one instead of inheriting a broken one.
   */
  const release = async (cause?: Error): Promise<void> => {
    if (released) return;
    released = true;
    client.removeAllListeners("notification");
    if (lost) {
      // The pool's removal path calls `end()` without a catch, and `end()` on a
      // connection that is already gone rejects — an unhandled rejection, on
      // the very path that exists to keep one dropped connection from ending
      // the process. Ending it here first, with the rejection handled, leaves
      // the pool's own call nothing left to fail at.
      //
      // **Bounded, because `end()` on a socket that is gone can wait for a
      // graceful shutdown that never arrives.** This is awaited inside the
      // stream route's `finally`, so a hang here is a function invocation held
      // until the platform kills it, with the row it was writing still
      // `claimed`. The point of the call is to own the rejection, and that is
      // achieved the moment the handler is attached; the release below does not
      // depend on the socket ever closing.
      await Promise.race([
        client.end().catch(() => undefined),
        new Promise<void>((resolve) => {
          setTimeout(resolve, END_TIMEOUT_MS);
        }),
      ]);
    }
    if (cause === undefined) {
      client.release();
      return;
    }
    client.release(cause);
  };

  // A checked-out client is the one thing `pg` does not carry an error listener
  // for: the pool removes its own on checkout and hands the client to the
  // caller. So a backend that dies mid-stream — Neon scaling to zero, a
  // restart, an admin terminating it — emits `error` on an `EventEmitter` with
  // nothing listening, which in Node is an unhandled `error` event and takes
  // the process with it. One dropped connection would end every stream and
  // every request on the instance, not the one stream that lost its connection.
  client.on("error", (cause: Error) => {
    lost = true;
    // A close already running owns the release, and its `finally` does it once
    // the rejected `UNLISTEN` comes back. Tearing the client down from here at
    // the same time destroys a connection with a query still in flight, and
    // `pg` rejects that query a second time with nobody listening.
    if (closed) return;
    closed = true;
    void release(cause);
  });

  client.on("notification", (message) => {
    if (message.channel !== channel || message.payload === undefined) return;
    try {
      const parsed: unknown = JSON.parse(message.payload);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "seq" in parsed &&
        typeof parsed.seq === "number"
      ) {
        onSeq(parsed.seq);
      }
    } catch {
      // A payload this process cannot parse is not a reason to drop the
      // stream: the reader's next poll of `readSince` picks the event up
      // anyway, because the table is the source of truth and the notification
      // is only a nudge.
    }
  });

  // `LISTEN` cannot parameterize its channel, and the channel is derived from a
  // uuid with its hyphens removed — so it is a plain identifier by
  // construction, and `identifier()` proves it rather than assuming it.
  await client.query(`LISTEN ${identifier(channel)}`);

  return {
    close: async () => {
      // Closing twice is the ordinary case here — the route closes on abort and
      // again in its `finally` — and closing after a loss is the other one.
      if (closed) return;
      closed = true;
      try {
        await client.query(`UNLISTEN ${identifier(channel)}`);
      } catch {
        // The connection is gone, which is what `UNLISTEN` was for. Reported as
        // a loss rather than thrown: a caller asking to stop listening does not
        // need an error about the listening having already stopped, and this
        // one is awaited inside a stream's `finally` where a throw would become
        // an unhandled rejection.
        lost = true;
      } finally {
        await release();
      }
    },
    /** Whether the connection was lost rather than closed. */
    lost: () => lost,
  };
};
