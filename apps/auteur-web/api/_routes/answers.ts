import { parseBody } from "@auteur/api-contract/contract";
import { ROUTES } from "@auteur/api-contract/routes";
import type { Db } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import {
  answerQuestion,
  invalidateDescendants,
  listQuestions,
} from "@auteur/session-store/questions";
import { requireSession } from "@auteur/session-store/sessions";
import { Hono } from "hono";
import { idOf } from "./_id.ts";

/**
 * `POST /api/sessions/:id/answers` — answer or skip one question.
 *
 * The interesting half is what happens to the questions below it. §6.5: an
 * edited answer invalidates every transitive descendant, and the rows are kept
 * and marked rather than deleted, so "you answered this, then changed it" stays
 * visible in the log. Deleting them would make the history a lie by omission.
 *
 * Nothing is re-run here. Invalidating changes the answer set, which changes
 * `outline`'s input key, which is what `POST /advance` reads — so the
 * consequences are §7.5's rather than this route's, and there is no second
 * opinion about what an edit invalidates.
 */
export const answerRoutes = (deps: { readonly db: Db }): Hono => {
  const routes = new Hono();
  const { db } = deps;

  routes.post(ROUTES.answers.path, async (context) => {
    const id = idOf(context.req.param("id") ?? "");
    const body = parseBody("answers", await context.req.json());
    await requireSession(db, id);

    const answered = await answerQuestion(db, body.questionId, body.answer);
    if (!answered) {
      // The question does not exist, or belongs to another session, or has
      // already been invalidated. All three are "there is nothing here to
      // answer", and none of them should read as a successful write.
      throw new AuteurError(
        "not_found",
        "There is no open question with that id in this session.",
      );
    }

    const invalidated = await invalidateDescendants(db, id, body.questionId);
    return context.json({
      invalidated,
      questions: await listQuestions(db, id),
    });
  });

  return routes;
};
