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
  let lost = false;

  // A checked-out client is the one thing `pg` does not carry an error listener
  // for: the pool removes its own on checkout and hands the client to the
  // caller. So a backend that dies mid-stream — Neon scaling to zero, a restart,
  // an admin terminating it — emits `error` on an `EventEmitter` with nothing
  // listening, which in Node is an unhandled `error` event and takes the
  // process with it. One dropped connection would end every stream and every
  // request on the instance, not the one stream that lost its connection.
  //
  // `release(error)` rather than `release()`: a connection that errored is
  // destroyed rather than returned to the pool, so the next subscriber opens a
  // new one instead of inheriting a broken one.
  client.on("error", (cause: Error) => {
    if (closed) return;
    closed = true;
    lost = true;
    client.removeAllListeners("notification");
    client.release(cause);
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
      // Already released by the error listener above, and `UNLISTEN` on a dead
      // connection throws. Closing twice is the ordinary case here — the route
      // closes on abort and again in its `finally`.
      if (closed) return;
      closed = true;
      client.removeAllListeners("notification");
      await client.query(`UNLISTEN ${identifier(channel)}`);
      client.release();
    },
    /** Whether the connection was lost rather than closed. */
    lost: () => lost,
  };
};
