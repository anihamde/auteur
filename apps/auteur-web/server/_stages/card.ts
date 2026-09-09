import { putCard } from "@auteur/card-store/cards";
import type { ProsodyBlock } from "@auteur/core/prosody";
import type { StyleCard } from "@auteur/core/style-card";
import { findAuthor } from "@auteur/corpus-store/authors";
import { listPassagesForWork } from "@auteur/corpus-store/passages";
import { listWorksByAuthor } from "@auteur/corpus-store/works";
import { AuteurError } from "@auteur/errors/auteur-error";
import { newId } from "@auteur/ids/new-id";
import { cardFromExtraction, extractionSchema } from "@auteur/pipeline/extract";
import { styleExtract } from "@auteur/prompt/style-extract";
import { PROMPT_VERSIONS } from "@auteur/prompt/versions";
import { prosodyVersion } from "@auteur/prosody/version";
import { updateSession } from "@auteur/session-store/sessions";
import { buildKey } from "@auteur/style-card/build-key";
import { cleanerVersion, segmenterVersion } from "@auteur/text/version";
import { callModel, type StageContext } from "./context.ts";

/**
 * `style-extract` — the card, and the cache that makes it worth building.
 *
 * §4.4: the same author, works, toolchain, prompt and model produce the same
 * card, and `build_key` is what says so. The key is computed **before** the
 * model call, so a cache hit costs nothing — which is the whole point of a card
 * that takes forty passages and a large model to build.
 */

/** How many passages the extraction reads. §4.3. */
export const EXTRACT_PASSAGES = 40;

const EXTRACTION_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    exemplars: {
      items: {
        additionalProperties: false,
        properties: {
          demonstrates: { type: "string" },
          passageId: { type: "string" },
        },
        required: ["demonstrates", "passageId"],
        type: "object",
      },
      type: "array",
    },
    fields: {
      items: {
        additionalProperties: false,
        properties: {
          citationPassageId: { type: "string" },
          path: { type: "string" },
          value: {},
        },
        required: ["citationPassageId", "path", "value"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["exemplars", "fields"],
  type: "object",
} as const;

export const runStyleExtract = async (
  context: StageContext,
  prosody: ProsodyBlock,
): Promise<StyleCard> => {
  const authorId = context.session.authorId;
  if (authorId === null) {
    throw new AuteurError("invalid_input", "This session has no author.");
  }
  const author = await findAuthor(context.db, authorId);
  if (author === undefined) {
    throw new AuteurError("not_found", `${authorId} is not a known author.`);
  }

  const works = await listWorksByAuthor(context.db, authorId, cleanerVersion());
  const key = buildKey({
    authorId,
    cleanerVersion: cleanerVersion(),
    extractionModelId: context.model.id,
    extractionPromptVersion: PROMPT_VERSIONS["style-extract"],
    prosodyVersion: prosodyVersion(),
    segmenterVersion: segmenterVersion(),
    workIds: works.map((work) => work.id),
  });

  const passages = (
    await Promise.all(
      works.map(async (work) =>
        (
          await listPassagesForWork(context.db, work.id)
        ).map((passage) => ({
          ...passage,
          workTitle: work.title,
          year: work.year,
        })),
      ),
    )
  )
    .flat()
    .slice(0, EXTRACT_PASSAGES);

  if (passages.length === 0) {
    throw new AuteurError(
      "corpus_unusable",
      "No passages were segmented from this corpus, so there is nothing to read a style from.",
    );
  }

  const extraction = await callModel(context, {
    jsonSchema: EXTRACTION_JSON_SCHEMA,
    prompt: styleExtract.build({
      authorName: author.displayName,
      passages: passages.map((passage) => ({
        id: passage.id,
        text: passage.text,
        workTitle: passage.workTitle,
      })),
      // A `ProsodyBlock` extends `WorkProsody`, so the corpus block is the
      // work-shaped measurement the prompt reads — no projection needed.
      prosody,
    }),
    schema: extractionSchema,
    system: "Return only JSON matching the declared schema.",
  });

  const card = cardFromExtraction({
    author: {
      displayName: author.displayName,
      id: author.id,
      kind: author.kind,
      ...(author.birthYear !== null && { birthYear: author.birthYear }),
      ...(author.deathYear !== null && { deathYear: author.deathYear }),
    },
    extraction,
    passages: passages.map((passage) => ({
      id: passage.id,
      workId: passage.workId,
      workTitle: passage.workTitle,
      ...(passage.year !== null && { year: passage.year }),
    })),
    prosody,
    sources: works.map((work) => ({
      id: work.id,
      title: work.title,
      wordCount: work.wordCount,
      ...(work.translator !== null && { translator: work.translator }),
      ...(work.year !== null && { year: work.year }),
    })),
    toolchain: {
      cleaner: cleanerVersion(),
      prosody: prosodyVersion(),
      segmenter: segmenterVersion(),
    },
    version: 1,
  });

  // `putCard` decides the version and returns the existing row on a key hit, so
  // a rebuild with identical inputs does not produce a second identity for one
  // thing — which is what makes `borges@3` mean something.
  const written = await putCard(context.db, {
    authorId,
    buildKey: key,
    card,
    confidence: card.confidence,
    id: newId(),
    provenance: author.kind,
  });

  await updateSession(context.db, context.sessionId, {
    cardId: written.card.id,
  });
  await context.emit({
    line: written.inserted
      ? `card@${written.card.version.toString()} built from ${passages.length.toString()} passages`
      : `card@${written.card.version.toString()} reused — same corpus, toolchain, prompt and model`,
    stageId: context.stage.id,
    type: "stage_detail",
  });

  return written.card.card;
};
