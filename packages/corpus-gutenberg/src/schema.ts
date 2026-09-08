import { z } from "zod";

/**
 * The gutendex response, as a schema rather than a cast.
 *
 * **Unverified.** The build environment has no egress to `gutendex.com`
 * (`docs/IMPLEMENTATION-PLAN.md` §4), so every field name here comes from the
 * API's public documentation by way of `ARCHITECTURE.md` §5.2 — not from a live
 * response. The fixture beside this file is named `*.synthetic.json` for the
 * same reason.
 *
 * Two properties make a wrong guess loud rather than silent, which is what
 * invariant 4 is for:
 *
 * - **Unknown keys are rejected, not ignored.** `.strict()` rather than the
 *   default. A response that grew a field is worth knowing about, and a
 *   response whose fields moved is worth failing on: ignoring the extra is how
 *   a renamed field becomes `undefined` and a card gets built from nothing.
 * - **Every field the provider reads is required.** An optional field with a
 *   wrong name parses happily and yields `undefined` on every row, which is
 *   indistinguishable from an author who genuinely has no birth year.
 *
 * So a live response shaped differently throws on the first search, naming the
 * field. That is the whole reason the schema is written before the probe runs.
 */

/**
 * A person gutendex reports — an author, a translator, an editor.
 *
 * `birth_year` and `death_year` are genuinely nullable in the data: an author
 * whose dates nobody recorded has `null`, not a missing key. Nullable and
 * required is the shape that says so; optional would also accept the key being
 * gone, which is the case this schema exists to catch.
 */
export const gutendexPersonSchema = z
  .object({
    birth_year: z.number().int().nullable(),
    death_year: z.number().int().nullable(),
    name: z.string().min(1),
  })
  .strict();
export type GutendexPerson = z.infer<typeof gutendexPersonSchema>;

/**
 * One book.
 *
 * `formats` is a map from media type to url and is deliberately typed as such
 * rather than enumerated: the plain-text entry arrives under several media
 * types (`text/plain; charset=utf-8`, `text/plain`), the set is not documented
 * as closed, and enumerating it would fail a book for offering a format this
 * code does not need. `fetch.ts` picks from it; the schema only insists it is
 * a map of strings.
 *
 * `copyright` is nullable because gutendex reports `null` for books whose
 * status it does not know, which is not the same as "not copyrighted".
 */
export const gutendexBookSchema = z
  .object({
    authors: z.array(gutendexPersonSchema),
    bookshelves: z.array(z.string()),
    copyright: z.boolean().nullable(),
    download_count: z.number().int().nonnegative(),
    formats: z.record(z.string(), z.string()),
    id: z.number().int().positive(),
    languages: z.array(z.string()),
    media_type: z.string(),
    subjects: z.array(z.string()),
    summaries: z.array(z.string()),
    title: z.string(),
    translators: z.array(gutendexPersonSchema),
  })
  .strict();
export type GutendexBook = z.infer<typeof gutendexBookSchema>;

/**
 * A search page.
 *
 * `next` and `previous` are urls or `null`. They are carried rather than
 * dropped because author folding counts works per author, and a fold that read
 * only the first page would report a work count that shrinks as an author gets
 * more popular.
 */
export const gutendexSearchSchema = z
  .object({
    count: z.number().int().nonnegative(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(gutendexBookSchema),
  })
  .strict();
export type GutendexSearch = z.infer<typeof gutendexSearchSchema>;

/**
 * Parse a response, or throw naming what moved.
 *
 * `z.prettifyError` rather than the raw issue list: the message is read by
 * whoever runs the probe against the live API, and "expected number, received
 * undefined at results[0].id" is the sentence that tells them which field the
 * documentation got wrong.
 */
export const parseSearch = (payload: unknown): GutendexSearch => {
  const result = gutendexSearchSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      `gutendex returned a shape this schema does not accept.\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
};
