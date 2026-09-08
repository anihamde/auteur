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
      if (closed) return;
      closed = true;
      client.removeAllListeners("notification");
      await client.query(`UNLISTEN ${identifier(channel)}`);
      client.release();
    },
  };
};
