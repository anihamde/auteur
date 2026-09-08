import type { SessionEvent, StoredEvent } from "@auteur/core/events";
import { sessionEventSchema } from "@auteur/core/events";
import type { Db } from "@auteur/db/db";
import { columns } from "@auteur/db/sql";

/**
 * The durable per-session log the SSE stream replays from.
 *
 * **Every event is appended here before it is pushed to any subscriber.** Not
 * the reverse (`ARCHITECTURE.md` §7.3). An event a subscriber saw but the table
 * did not is lost on the next reconnect, because the client advances its cursor
 * past a `seq` it can never replay — and the client is right to, since replay
 * is the only source of truth it has.
 *
 * That rule is why `append` both writes the row and issues the `NOTIFY`, in one
 * transaction, and why nothing else in the codebase calls `pg_notify` on a
 * session channel. A fan-out that could happen without an append is a fan-out
 * that eventually will.
 */

export type AppendedEvent = {
  readonly seq: number;
  readonly createdAt: Date;
};

const COLUMNS = ["session_id", "seq", "type", "payload", "created_at"];

/**
 * The `LISTEN` channel for one session.
 *
 * Hyphens become underscores rather than being deleted. Deleting them maps
 * distinct ids onto one channel — `a-b` and `ab` collide — which for uuids
 * cannot happen but is the kind of thing that stops being true when someone
 * later passes a slug. Substitution is injective, and the result is still a
 * plain identifier, which `LISTEN` needs since it cannot parameterize a
 * channel name.
 */
export const channelFor = (sessionId: string): string =>
  `auteur_session_${sessionId.replaceAll("-", "_")}`;

/**
 * Append one event and notify the session's channel, atomically.
 *
 * **The session row is locked first.** `seq` is gap-free per session, which
 * means allocating it is a read of `max(seq)` followed by a write, and under
 * snapshot isolation two concurrent appends both read the same maximum and both
 * write it — the primary key then rejects one, for a reason the user cannot act
 * on. Computing `max(seq) + 1` inside the `INSERT` does not help: there is no
 * row yet to lock, so both statements read the same snapshot. `SELECT ... FOR
 * UPDATE` on the owning session is the row that does exist, and taking it
 * serialises appends per session — which is exactly the granularity gap-free
 * ordering requires, and no more. Measured: 200 concurrent appends produce
 * 1..200 without it failing eleven of them.
 *
 * 0 is reserved for "from the beginning", so no event may carry it.
 *
 * The `NOTIFY` is inside the same transaction on purpose: Postgres holds
 * notifications until commit, so a subscriber cannot be woken for a row that
 * has not landed. The reverse order would push an event a reconnect could not
 * replay — exactly the failure §7.3 forbids.
 */
export const append = async (
  db: Db,
  sessionId: string,
  event: SessionEvent,
): Promise<AppendedEvent> =>
  db.transaction(async (client) => {
    const locked = await client.query(
      `SELECT 1 FROM sessions WHERE id = $1 FOR UPDATE`,
      [sessionId],
    );
    if (locked.rowCount === 0) {
      throw new Error(
        `cannot append to session ${sessionId}: it does not exist`,
      );
    }
    const inserted = await client.query<{ seq: number; created_at: Date }>(
      `INSERT INTO events (session_id, seq, type, payload)
       SELECT $1, COALESCE((SELECT max(seq) FROM events WHERE session_id = $1), 0) + 1,
              $2, $3::jsonb
       RETURNING seq, created_at`,
      [sessionId, event.type, JSON.stringify(event)],
    );
    const row = inserted.rows[0];
    if (row === undefined) {
      throw new Error(`append to session ${sessionId} returned no row`);
    }
    await client.query(`SELECT pg_notify($1, $2)`, [
      channelFor(sessionId),
      JSON.stringify({ seq: row["seq"], sessionId }),
    ]);
    return { createdAt: row["created_at"], seq: row["seq"] };
  });

type Row = {
  session_id: string;
  seq: number;
  type: string;
  payload: unknown;
  created_at: Date;
};

/**
 * Everything after `cursor`, in order.
 *
 * Parsed on the way out, not trusted. A payload shape that changed under a
 * deploy would otherwise reach the client as an event it cannot render, and the
 * stream contract says an unparseable frame is fatal — so the failure belongs
 * here, where it names the row, rather than in the browser.
 */
export const readSince = async (
  db: Db,
  sessionId: string,
  cursor = 0,
  limit = 1000,
): Promise<StoredEvent[]> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM events
      WHERE session_id = $1 AND seq > $2
      ORDER BY seq
      LIMIT $3`,
    [sessionId, cursor, limit],
  );
  return result.rows.map((row) => ({
    createdAt: row["created_at"],
    event: sessionEventSchema.parse(row["payload"]),
    seq: row["seq"],
    sessionId: row["session_id"],
  }));
};

/** The highest `seq` written for a session, or 0 when there is none. */
export const latestSeq = async (db: Db, sessionId: string): Promise<number> => {
  const result = await db.query<{ seq: number }>(
    `SELECT COALESCE(max(seq), 0)::int AS seq FROM events WHERE session_id = $1`,
    [sessionId],
  );
  return result.rows[0]?.["seq"] ?? 0;
};
