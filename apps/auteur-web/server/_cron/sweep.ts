import type { Db } from "@auteur/db/db";
import { append } from "@auteur/event-store/events";
import { MAX_ATTEMPTS } from "@auteur/stage-queue/queue";
import {
  abandonStaleClaim,
  findAbandonedQueued,
  findStaleClaims,
  QUEUED_AFTER_SECONDS,
  releaseStaleClaim,
  STALE_AFTER_SECONDS,
} from "@auteur/stage-queue/sweep";
import type { AdvanceDeps } from "../_routes/advance.ts";

/**
 * The one-minute sweep, §5.3.
 *
 * There is no supervising process, so a lost invocation leaves one of exactly
 * two traces: a row still `queued` that nobody came to run, or a row `claimed`
 * that stopped moving. The sweep looks for both and does the least it can about
 * each — re-invoke the first, put the second back on the queue.
 *
 * **What it must not do is touch a healthy in-flight row.** Sweeping a live
 * stage is the failure mode this exists to avoid rather than to cause, which is
 * why every write here repeats its age condition in the `WHERE` clause: between
 * the read and the write the original invocation may have come back and
 * finished, and the update then changes nothing.
 */

export type SweepDeps = {
  readonly db: Db;
  /**
   * The handle events are appended on. `append` is transactional — the NOTIFY
   * has to land with the row — and a pooled handle refuses a transaction
   * (§3.1), so this is the direct one on the deployment and `db` in a test.
   */
  readonly eventDb: Db;
  readonly invokeStage: NonNullable<AdvanceDeps["invokeStage"]>;
  /** Overridden only by a test that cannot wait five minutes. */
  readonly staleAfterSeconds?: number;
  readonly queuedAfterSeconds?: number;
};

export type SweepResult = {
  /** Queued rows nobody ran, asked for again. */
  readonly reinvoked: readonly string[];
  /** Lost claims put back on the queue for another attempt. */
  readonly released: readonly string[];
  /** Lost claims out of budget. The run is over and the client is told why. */
  readonly failed: readonly string[];
};

export const sweep = async (deps: SweepDeps): Promise<SweepResult> => {
  const staleAfter = deps.staleAfterSeconds ?? STALE_AFTER_SECONDS;
  const queuedAfter = deps.queuedAfterSeconds ?? QUEUED_AFTER_SECONDS;

  const reinvoked: string[] = [];
  for (const row of await findAbandonedQueued(deps.db, queuedAfter)) {
    // No claim is taken here. Asking for the stage to run is all this does, and
    // whoever answers claims it — so a sweep racing a late invocation is the
    // same race the claim already settles.
    await deps.invokeStage({
      queueId: row.id,
      sessionId: row.sessionId,
      stageId: row.stageId,
    });
    reinvoked.push(row.id);
  }

  const released: string[] = [];
  const failed: string[] = [];
  for (const claim of await findStaleClaims(deps.db, staleAfter)) {
    if (claim.attempt + 1 < MAX_ATTEMPTS) {
      if (await releaseStaleClaim(deps.db, claim.id, staleAfter)) {
        released.push(claim.id);
        await deps.invokeStage({
          queueId: claim.id,
          sessionId: claim.sessionId,
          stageId: claim.stageId,
        });
      }
      continue;
    }
    if (await abandonStaleClaim(deps.db, claim.id, staleAfter)) {
      failed.push(claim.id);
      // Appended so a client reconnecting at its cursor is told the run ended
      // and why. Without it the stream simply stops, which reads as a slow
      // stage rather than a finished one.
      // `eventDb`: appending is transactional and a pooled handle refuses one.
      await append(deps.eventDb, claim.sessionId, {
        code: "internal",
        message:
          "This stage stopped responding and has been retried as often as it can be.",
        stageId: claim.stageId,
        type: "stage_error",
      });
    }
  }

  return { failed, reinvoked, released };
};
