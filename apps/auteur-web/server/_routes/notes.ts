import { parseBody } from "@auteur/api-contract/contract";
import { ROUTES } from "@auteur/api-contract/routes";
import type { Db } from "@auteur/db/db";
import { newId } from "@auteur/ids/new-id";
import {
  addRevisionNote,
  listRevisionNotes,
} from "@auteur/session-store/revision-notes";
import { requireSession } from "@auteur/session-store/sessions";
import { Hono } from "hono";
import { idOf } from "./_id.ts";

/**
 * `POST /api/sessions/:id/notes` — what the reader says about what they read.
 *
 * Nothing is re-run here, which is the arrangement `answers` already has and
 * for the same reason: filing a note changes the note set, which changes the
 * stage's input key, which is what `POST /advance` reads. So what a note
 * invalidates is §7.5's answer and not this route's, and there is no second
 * opinion about it anywhere.
 *
 * The response is the whole list for that stage rather than the row just
 * written. The screen renders the notes so far, and a client appending its own
 * would be a second place their order is decided.
 */
export const noteRoutes = (deps: { readonly db: Db }): Hono => {
  const routes = new Hono();
  const { db } = deps;

  routes.post(ROUTES.notes.path, async (context) => {
    const id = idOf(context.req.param("id") ?? "");
    const body = parseBody("notes", await context.req.json());
    // Before the insert, so a note against a session that does not exist is a
    // 404 rather than a foreign-key violation reported as `internal`.
    await requireSession(db, id);

    await addRevisionNote(db, {
      id: newId(),
      note: body.note,
      sessionId: id,
      stageId: body.stageId,
    });
    return context.json({
      notes: await listRevisionNotes(db, id, body.stageId),
    });
  });

  return routes;
};
