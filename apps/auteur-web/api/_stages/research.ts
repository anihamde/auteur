import { PROVIDER } from "@auteur/corpus-gutenberg/authors";
import { fetchWorks } from "@auteur/corpus-gutenberg/fetch";
import { searchBooks } from "@auteur/corpus-gutenberg/gutendex";
import { selectPassages } from "@auteur/corpus-gutenberg/passages";
import type { GutendexBook } from "@auteur/corpus-gutenberg/schema";
import { recordMeasuredWords } from "@auteur/corpus-store/authors";
import { putPassages } from "@auteur/corpus-store/passages";
import { listWorksByAuthor, putWork } from "@auteur/corpus-store/works";
import { AuteurError } from "@auteur/errors/auteur-error";
import { corpusSelect } from "@auteur/prompt/corpus-select";
import { measureCorpus } from "@auteur/prosody/prosody";
import { cleanerVersion } from "@auteur/text/version";
import { z } from "zod";
import { callModel, type StageContext } from "./context.ts";

/**
 * The three research stages: choose the works, fetch them, measure them.
 *
 * They are one file because they are one conversation with the corpus and their
 * outputs chain directly — `corpus-select` names ids, `work-fetch` turns them
 * into rows, `prosody-compute` reads those rows. Splitting them would mean
 * three files that each import the other two's schemas.
 */

/** How many works one card is built from. §4.1. */
export const CORPUS_LIMIT = 12;

export const corpusSelectionSchema = z.object({
  chosen: z
    .array(
      z.object({
        id: z.string().min(1),
        why: z.string().min(1),
      }),
    )
    .min(1),
});
export type CorpusSelection = z.infer<typeof corpusSelectionSchema>;

const CORPUS_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    chosen: {
      items: {
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          why: { type: "string" },
        },
        required: ["id", "why"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["chosen"],
  type: "object",
} as const;

/**
 * `corpus-select` — which works, and why each.
 *
 * The candidate list comes from gutendex, and the model chooses from it. It
 * cannot invent an id: the selection is filtered against the candidates before
 * it is stored, so a hallucinated id is dropped here rather than becoming a
 * 404 in `work-fetch` two minutes later.
 */
export const runCorpusSelect = async (
  context: StageContext,
  config: { readonly fetch?: typeof globalThis.fetch } = {},
): Promise<CorpusSelection & { readonly books: readonly GutendexBook[] }> => {
  const authorId = context.session.authorId;
  if (authorId === null) {
    throw new AuteurError(
      "invalid_input",
      "This session has no author, so there is no corpus to choose from.",
    );
  }
  const authorName = authorId.slice(`${PROVIDER}:`.length);

  const books = await searchBooks(
    authorName.replaceAll("-", " "),
    config.fetch === undefined ? {} : { fetch: config.fetch },
  );
  if (books.length === 0) {
    throw new AuteurError(
      "corpus_unavailable",
      `Project Gutenberg returned no works for ${authorName}.`,
    );
  }

  await context.emit({
    line: `${books.length.toString()} works found; choosing ${CORPUS_LIMIT.toString()}`,
    stageId: context.stage.id,
    type: "stage_detail",
  });

  const selection = await callModel(context, {
    jsonSchema: CORPUS_JSON_SCHEMA,
    prompt: corpusSelect.build({
      authorName,
      limit: CORPUS_LIMIT,
      works: books.map((book) => ({
        firstPassage: "",
        id: book.id.toString(),
        title: book.title,
        wordCount: null,
        year: null,
      })),
    }),
    schema: corpusSelectionSchema,
    system: corpusSelect.build({ authorName, limit: CORPUS_LIMIT, works: [] }),
  });

  // A hallucinated id is dropped here rather than becoming a 404 two minutes
  // later. The model chooses from the list; it does not extend it.
  const byId = new Map(books.map((book) => [book.id.toString(), book]));
  const chosen = selection.chosen.filter((entry) => byId.has(entry.id));
  if (chosen.length === 0) {
    throw new AuteurError(
      "schema_violation",
      "The corpus selection named no work that was offered to it.",
    );
  }
  for (const entry of chosen) {
    await context.emit({
      line: `${byId.get(entry.id)?.title ?? entry.id} — ${entry.why}`,
      stageId: context.stage.id,
      type: "stage_detail",
    });
  }

  return {
    books: chosen.flatMap((entry) => {
      const book = byId.get(entry.id);
      return book === undefined ? [] : [book];
    }),
    chosen,
  };
};

/**
 * `work-fetch` — download, clean, segment, store.
 *
 * A work that fails to fetch is **dropped with a detail line**, not fatal: one
 * unavailable translation should not end a run built on eleven others. Every
 * work failing is fatal, because there is then nothing to measure.
 */
export const runWorkFetch = async (
  context: StageContext,
  books: readonly GutendexBook[],
  config: { readonly fetch?: typeof globalThis.fetch } = {},
): Promise<{ readonly stored: number; readonly words: number }> => {
  const authorId = context.session.authorId;
  if (authorId === null) {
    throw new AuteurError("invalid_input", "This session has no author.");
  }

  const outcomes = await fetchWorks(
    books,
    config.fetch === undefined
      ? { signal: context.signal }
      : { fetch: config.fetch, signal: context.signal },
  );

  let words = 0;
  let stored = 0;
  for (const outcome of outcomes) {
    if (!outcome.ok) {
      await context.emit({
        line: `dropped ${outcome.title}: ${outcome.reason}`,
        stageId: context.stage.id,
        type: "stage_detail",
      });
      continue;
    }
    const work = outcome.work;
    await putWork(context.db, {
      authorId,
      cleanerVersion: work.cleanerVersion,
      id: work.id,
      language: "en",
      sourceUrl: work.sourceUrl,
      text: work.text,
      title: work.title,
      translator: work.translator,
      wordCount: work.wordCount,
      year: null,
    });
    await putPassages(
      context.db,
      selectPassages([work]).map((candidate) => ({
        charEnd: candidate.charEnd,
        charStart: candidate.charStart,
        id: candidate.id,
        text: candidate.text,
        workId: work.id,
      })),
    );
    words += work.wordCount;
    stored += 1;
    await context.emit({
      line: `${work.title} — ${work.wordCount.toLocaleString("en-US")} words`,
      stageId: context.stage.id,
      type: "stage_detail",
    });
  }

  if (stored === 0) {
    throw new AuteurError(
      "corpus_unavailable",
      "Every chosen work failed to fetch, so there is nothing to measure.",
    );
  }
  // The corpus size this system measured, not the one upstream claims.
  await recordMeasuredWords(context.db, authorId, words);
  return { stored, words };
};

/**
 * `prosody-compute` — the deterministic metrics over the whole corpus.
 *
 * No model, no tier, no cost. It is a stage because the research screen needs a
 * row for it and the report needs it in the graph, not because it is expensive.
 */
export const runProsodyCompute = async (context: StageContext) => {
  const authorId = context.session.authorId;
  if (authorId === null) {
    throw new AuteurError("invalid_input", "This session has no author.");
  }
  const works = await listWorksByAuthor(context.db, authorId, cleanerVersion());
  if (works.length === 0) {
    throw new AuteurError(
      "corpus_unavailable",
      "There are no fetched works to measure.",
    );
  }
  const block = measureCorpus(
    works.map((work) => ({
      id: work.id,
      text: work.text,
      title: work.title,
      wordCount: work.wordCount,
    })),
  );
  await context.emit({
    line: `${works.length.toString()} works measured`,
    stageId: context.stage.id,
    type: "stage_detail",
  });
  return block;
};
