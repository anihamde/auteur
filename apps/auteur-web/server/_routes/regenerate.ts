import { parseBody } from "@auteur/api-contract/contract";
import { ROUTES } from "@auteur/api-contract/routes";
import type { Db } from "@auteur/db/db";
import { newId } from "@auteur/ids/new-id";
import { requireSession } from "@auteur/session-store/sessions";
import { readStageKeys } from "@auteur/session-store/stage-keys";
import { enqueueForRun } from "@auteur/stage-queue/queue";
import { Hono } from "hono";
import { descendantsOf } from "../_graph.ts";
import { idOf } from "./_id.ts";
import type { AdvanceDeps } from "./advance.ts";

/**
 * `POST /api/sessions/:id/regenerate` — the same inputs, a different sample.
 *
 * The other way to change an output is to say what is wrong with it, which is
 * a note and reaches the stage through §7.5. This is the case where nothing is
 * wrong with it in particular: run it again and see what comes back.
 *
 * **It enqueues the tail as well, and it is the only route that does.** §7.5
 * makes a stage stale when its inputs change, and a regenerate changes none of
 * them. So the new beat sheet upserts over the old one, `story`'s input key —
 * built from `outline`'s *key*, not from its output — is unchanged, and the
 * next `advance` finds nothing stale. The reader would keep the story written
 * from the beat sheet they just discarded, permanently.
 *
 * Only descendants that have **already run** are enqueued. Regenerating an
 * outline on a session that has no story starts no story; regenerating one on a
 * finished session replaces the story and the report that scored it, which is
 * what "replace this output" means two stages down.
 */
export type RegenerateDeps = {
  readonly db: Db;
  readonly invokeStage?: AdvanceDeps["invokeStage"];
};

export const regenerateRoutes = (deps: RegenerateDeps): Hono => {
  const routes = new Hono();
  const { db } = deps;

  routes.post(ROUTES.regenerate.path, async (context) => {
    const id = idOf(context.req.param("id") ?? "");
    const body = parseBody("regenerate", await context.req.json());
    await requireSession(db, id);

    const completed = await readStageKeys(db, id);
    const rerun = [
      body.stageId,
      ...descendantsOf(body.stageId).filter((candidate) =>
        completed.has(candidate),
      ),
    ];

    // Regenerating is asking a stage that has already run to run again, which
    // a plain enqueue could not do: its finished row holds the attempt-0 key.
    // The id invoked is the returned row's, which on a stage already in flight
    // is the one that exists rather than the one just minted.
    const queued = [];
    for (const candidate of rerun) {
      queued.push(
        await enqueueForRun(db, {
          id: newId(),
          sessionId: id,
          stageId: candidate,
        }),
      );
    }
    const first = queued[0];
    if (first !== undefined) {
      await deps.invokeStage?.({
        queueId: first.id,
        sessionId: id,
        stageId: first.stageId,
      });
    }
    return context.json({ enqueued: rerun });
  });

  return routes;
};
