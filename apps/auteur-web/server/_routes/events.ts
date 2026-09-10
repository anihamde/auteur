import { parseQuery } from "@auteur/api-contract/contract";
import { ROUTES } from "@auteur/api-contract/routes";
import type { Db } from "@auteur/db/db";
import { readSince } from "@auteur/event-store/events";
import { subscribe } from "@auteur/event-store/listen";
import { requireSession } from "@auteur/session-store/sessions";
import { Hono } from "hono";
import { idOf } from "./_id.ts";

/**
 * `GET /api/sessions/:id/events` — replay from the cursor, then wait.
 *
 * §7.3's ordering rule is what makes this simple: every event is written to
 * `events` **before** it is pushed, so the table is the source of truth and the
 * stream is a convenience. This route therefore never invents an event — it
 * replays from the cursor, then uses `LISTEN` as a nudge to read more rows.
 * A dropped notification costs latency and nothing else.
 *
 * **This is the only route that opens the direct connection.** `LISTEN` binds
 * to a connection and pooled-mode PgBouncer lends that connection out between
 * statements, so a pooled `LISTEN` is accepted and then never delivers — the
 * worst shape a failure can take. `@auteur/db` refuses `connect()` on a pooled
 * handle rather than trusting anyone to remember.
 *
 * The stream ends at the function's ceiling, routinely and by design. That is
 * not a failure path: `stream-client` reconnects from its cursor and
 * de-duplicates by `seq`, so the ceiling costs one round trip.
 */

/**
 * How long the stream stays open before closing cleanly.
 *
 * Under the platform's ceiling on purpose. Ending the response ourselves gives
 * the client a clean close to reconnect from; being killed at the ceiling gives
 * it a torn connection, and the two look different to every proxy in between.
 */
export const STREAM_BUDGET_MS = 240_000;

/** How often the reader re-checks the table without a notification. */
export const POLL_INTERVAL_MS = 1000;

export type EventRoutesDeps = {
  /**
   * Where this route **reads**. Pooled, and deliberately not the handle below.
   *
   * The stream holds `directDb`'s connection for its whole life, and it polls
   * the table once a second on top of that. Reading from the same pool means
   * every open stream is competing with its own subscription for the four
   * connections a direct pool has: the fourth stream takes the last one, every
   * stream's next read has nowhere to borrow, and all four fail together five
   * seconds later. Holding and borrowing from one pool is what makes a limit
   * into a deadlock.
   */
  readonly db: Db;
  /** **Direct**, not pooled, and only ever held. See above. */
  readonly directDb: Db;
  /** Overridden by a test that will not wait four minutes. */
  readonly budgetMs?: number;
  readonly pollMs?: number;
};

const frame = (payload: unknown): string =>
  `data: ${JSON.stringify(payload)}\n\n`;

export const eventRoutes = (deps: EventRoutesDeps): Hono => {
  const routes = new Hono();
  const budget = deps.budgetMs ?? STREAM_BUDGET_MS;
  const poll = deps.pollMs ?? POLL_INTERVAL_MS;

  routes.get(ROUTES.events.path, async (context) => {
    const id = idOf(context.req.param("id") ?? "");
    const { cursor } = parseQuery("events", {
      cursor: context.req.query("cursor") ?? "0",
    });
    // 404 before the stream opens: a session that does not exist must not
    // produce a stream a client will reconnect to for ever.
    await requireSession(deps.db, id);

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const encoder = new TextEncoder();
        let sent = cursor;
        let closed = false;
        let wake: (() => void) | undefined;

        const drain = async (): Promise<void> => {
          for (const event of await readSince(deps.db, id, sent)) {
            if (closed) return;
            controller.enqueue(encoder.encode(frame(event)));
            sent = event.seq;
          }
        };

        const subscription = await subscribe(deps.directDb, id, () => {
          wake?.();
        });

        const finish = async (): Promise<void> => {
          if (closed) return;
          closed = true;
          await subscription.close();
          controller.close();
        };

        context.req.raw.signal.addEventListener("abort", () => {
          void finish();
        });

        // `finally`, because a read that throws after the subscription opened
        // would otherwise leave its connection held for the life of the
        // instance — and a direct pool has four. The failure would be
        // permanent rather than one lost stream.
        try {
          // Replay first, then wait. A client reconnecting at its cursor gets
          // every missed event before anything new arrives, in order.
          await drain();

          const deadline = Date.now() + budget;
          while (!closed && Date.now() < deadline) {
            // Woken by a notification, or by the poll — whichever comes first.
            // The poll is not a fallback for correctness, only for latency:
            // the next drain reads the table either way.
            await new Promise<void>((resolve) => {
              wake = resolve;
              setTimeout(resolve, poll);
            });
            wake = undefined;
            await drain();
          }
        } finally {
          await finish();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream",
      },
    });
  });

  return routes;
};
