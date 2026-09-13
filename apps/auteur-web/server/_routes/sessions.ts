import { parseBody } from "@auteur/api-contract/contract";
import { ROUTES } from "@auteur/api-contract/routes";
import { findCard } from "@auteur/card-store/cards";
import { styleFitReportSchema } from "@auteur/core/fit";
import {
  type DecisionEntry,
  decisionEntrySchema,
  outlineSchema,
  storySchema,
} from "@auteur/core/session";
import type { Db } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import { newId } from "@auteur/ids/new-id";
import { findArtifact } from "@auteur/session-store/artifacts";
import { listQuestions } from "@auteur/session-store/questions";
import { revisionNotesFor } from "@auteur/session-store/revision-notes";
import {
  createSession,
  deleteSession,
  requireSession,
  type SessionPatch,
  updateSession,
} from "@auteur/session-store/sessions";
import { Hono } from "hono";
import { z } from "zod";
import { idOf } from "./_id.ts";

/**
 * The four session routes, and the one response a reload is built from.
 *
 * §7.1: `GET /api/sessions/:id` returns everything the client needs to redraw
 * itself — the session row, the answers, the three result tabs and the
 * decisions log — in **one** response. Not because a round trip is expensive
 * but because invariant 3 says every step is re-enterable: a client that
 * assembles its state from six requests has six chances to render a half-loaded
 * screen, and one of them will be the one a reader sees.
 */

/**
 * An artifact body, parsed with the schema its kind is described by.
 *
 * A row this application wrote is still external data — it came back over a
 * connection, from a database another version of this code may have written to.
 * A malformed body is a real failure and becomes a 500; it is not turned into
 * `null`, which would render the tab as empty and hide the fact.
 */
const artifactBody = async <Schema extends z.ZodType>(
  db: Db,
  sessionId: string,
  kind: "outline" | "draft" | "report" | "decisions",
  schema: Schema,
): Promise<z.infer<Schema> | null> => {
  const stored = await findArtifact(db, sessionId, kind);
  return stored === undefined ? null : schema.parse(stored.body);
};

export const sessionRoutes = (deps: { readonly db: Db }): Hono => {
  const routes = new Hono();
  const { db } = deps;

  routes.post(ROUTES.createSession.path, async (context) => {
    const body = parseBody("createSession", await context.req.json());
    const session = await createSession(db, {
      constraints: body.constraints ?? null,
      id: newId(),
      idea: body.idea,
      lengthPreset: body.lengthPreset,
    });
    return context.json(session, 201);
  });

  routes.get(ROUTES.session.path, async (context) => {
    const id = idOf(context.req.param("id") ?? "");
    // Throws `not_found` for an unknown id, which the app maps to a 404.
    const session = await requireSession(db, id);
    const [answers, decisions, outline, report, story, card, notes] =
      await Promise.all([
        listQuestions(db, id),
        artifactBody(db, id, "decisions", z.array(decisionEntrySchema)),
        artifactBody(db, id, "outline", outlineSchema),
        artifactBody(db, id, "report", styleFitReportSchema),
        artifactBody(db, id, "draft", storySchema),
        session.cardId === null ? undefined : findCard(db, session.cardId),
        revisionNotesFor(db, id),
      ]);

    return context.json({
      answers,
      // The card the session was built against, not the author's latest: a
      // session that ran on version 2 must keep showing version 2, or the
      // report's numbers stop describing the draft beside them.
      card: card?.card ?? null,
      decisions: (decisions ?? []) as DecisionEntry[],
      // Flattened and re-sorted rather than handed over grouped: the response
      // schema is a list, and the screen that wants one stage's notes filters
      // by `stageId` — which is one rule rather than a shape per consumer.
      notes: [...notes.values()]
        .flat()
        .toSorted(
          (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
        ),
      outline,
      report,
      session,
      story,
    });
  });

  routes.patch(ROUTES.patchSession.path, async (context) => {
    const id = idOf(context.req.param("id") ?? "");
    const body = parseBody("patchSession", await context.req.json());
    await requireSession(db, id);
    // Each key is copied only when it is present, because `updateSession`
    // distinguishes an absent key from an explicit `null` — absent means leave
    // the column, `null` means clear it. Spreading the parsed body wholesale
    // would work today and stop working the moment a field's absence and its
    // null mean different things, which for `constraints` they already do.
    // JSON carries no `undefined`, so "not `undefined`" is exactly "present".
    const patch: SessionPatch = {
      ...(body.constraints !== undefined && { constraints: body.constraints }),
      ...(body.idea !== undefined && { idea: body.idea }),
      ...(body.lengthPreset !== undefined && {
        lengthPreset: body.lengthPreset,
      }),
      ...(body.step !== undefined && { step: body.step }),
    };
    const session = await updateSession(db, id, patch);
    return context.json(session);
  });

  routes.delete(ROUTES.deleteSession.path, async (context) => {
    const id = idOf(context.req.param("id") ?? "");
    const deleted = await deleteSession(db, id);
    if (!deleted) {
      throw new AuteurError("not_found", `Session ${id} does not exist.`);
    }
    return context.json({ deleted });
  });

  return routes;
};
