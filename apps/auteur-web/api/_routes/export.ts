import { ROUTES } from "@auteur/api-contract/routes";
import { findCard } from "@auteur/card-store/cards";
import { styleFitReportSchema } from "@auteur/core/fit";
import { decisionEntrySchema, storySchema } from "@auteur/core/session";
import type { Db } from "@auteur/db/db";
import { AuteurError } from "@auteur/errors/auteur-error";
import { renderExport } from "@auteur/export/render-export";
import { findArtifact } from "@auteur/session-store/artifacts";
import { requireSession } from "@auteur/session-store/sessions";
import { Hono } from "hono";
import { z } from "zod";
import { idOf } from "./_id.ts";

/**
 * `GET /api/sessions/:id/export` — the story as markdown, with the label.
 *
 * §7.6's rule is structural and this route inherits it rather than restating
 * it: `renderExport` takes the label as a required argument, so there is no
 * query parameter, no flag and no branch here that could produce a document
 * without it. The label's author name comes from the card the session was built
 * against, which is also the name the sentence is about.
 *
 * A session with no draft is a 404 rather than an empty document: an export of
 * nothing, carrying the attribution sentence, would be a file claiming a story
 * was generated in someone's style when none was.
 */
export const exportRoutes = (deps: { readonly db: Db }): Hono => {
  const routes = new Hono();
  const { db } = deps;

  routes.get(ROUTES.exportStory.path, async (context) => {
    const id = idOf(context.req.param("id") ?? "");
    const session = await requireSession(db, id);

    const stored = await findArtifact(db, id, "draft");
    if (stored === undefined) {
      throw new AuteurError(
        "not_found",
        "This session has no draft to export yet.",
      );
    }
    const story = storySchema.parse(stored.body);

    if (session.cardId === null) {
      throw new AuteurError(
        "not_found",
        "This session has no style card, so there is no author to attribute it to.",
      );
    }
    const card = await findCard(db, session.cardId);
    if (card === undefined) {
      throw new AuteurError(
        "not_found",
        "The style card this session was built against no longer exists.",
      );
    }

    const [reportRow, decisionsRow] = await Promise.all([
      findArtifact(db, id, "report"),
      findArtifact(db, id, "decisions"),
    ]);
    const report =
      reportRow === undefined
        ? undefined
        : styleFitReportSchema.parse(reportRow.body);
    const decisions =
      decisionsRow === undefined
        ? []
        : z.array(decisionEntrySchema).parse(decisionsRow.body);

    const markdown = renderExport(
      {
        author: { displayName: card.card.author.displayName },
        cardVersion: card.version,
        confidence: card.confidence,
        decisions,
        markdown: story.markdown,
        measures: report?.measures ?? [],
        summary:
          report?.summary ?? "No style-fit report was produced for this draft.",
        title: story.title ?? undefined,
        wordCount: story.wordCount,
      },
      // The one place the label is constructed, and it is not optional.
      { authorName: card.card.author.displayName },
    );

    return context.body(markdown, 200, {
      "content-disposition": `attachment; filename="${story.title ?? "story"}.md"`,
      "content-type": "text/markdown; charset=utf-8",
    });
  });

  return routes;
};
