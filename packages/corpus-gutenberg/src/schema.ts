import { z } from "zod";

/**
 * The gutendex response, as a schema rather than a cast.
 *
 * **It describes what this code reads, and nothing else.** Written from the
 * API's documentation before anyone could reach `gutendex.com`
 * (`docs/IMPLEMENTATION-PLAN.md` §4), it originally listed every documented
 * field and rejected unknown keys with `.strict()`. Gutendex then added
 * `editors`, and every search on the deployment failed — a field this code
 * does not read, on a response that was otherwise exactly right.
 *
 * The rule that replaced it draws the line where the risk actually is:
 *
 * - **Every field the provider reads is required.** An optional field with a
 *   wrong name parses happily and yields `undefined` on every row, which is
 *   indistinguishable from an author who genuinely has no birth year. A rename
 *   upstream fails here, naming the field — which is what invariant 4 asks
 *   for, and it does not depend on strictness: a renamed field is an absent
 *   one.
 * - **Everything else is ignored.** Unknown keys are stripped, and fields this
 *   code never touches are not described at all. An upstream addition is not a
 *   breaking change, and treating it as one makes another service's roadmap
 *   into this product's outages.
 */

/**
 * A person gutendex reports — an author, a translator, an editor.
 *
 * `birth_year` and `death_year` are genuinely nullable in the data: an author
 * whose dates nobody recorded has `null`, not a missing key. Nullable and
 * required is the shape that says so; optional would also accept the key being
 * gone, which is the case this schema exists to catch.
 */
export const gutendexPersonSchema = z.object({
  birth_year: z.number().int().nullable(),
  death_year: z.number().int().nullable(),
  name: z.string().min(1),
});
export type GutendexPerson = z.infer<typeof gutendexPersonSchema>;

/**
 * One book.
 *
 * Five fields, because five are read: `authors` and `translators` fold into an
 * author list, `formats` and `id` and `title` fetch and name the text.
 * `bookshelves`, `subjects`, `summaries`, `copyright`, `download_count`,
 * `languages` and `media_type` are documented and unused, and describing them
 * only created seven more ways for a search to fail.
 *
 * `formats` is a map from media type to url and is deliberately typed as such
 * rather than enumerated: the plain-text entry arrives under several media
 * types (`text/plain; charset=utf-8`, `text/plain`), the set is not documented
 * as closed, and enumerating it would fail a book for offering a format this
 * code does not need. `fetch.ts` picks from it; the schema only insists it is
 * a map of strings.
 *
 */
export const gutendexBookSchema = z.object({
  authors: z.array(gutendexPersonSchema),
  formats: z.record(z.string(), z.string()),
  id: z.number().int().positive(),
  title: z.string(),
  translators: z.array(gutendexPersonSchema),
});
export type GutendexBook = z.infer<typeof gutendexBookSchema>;

/**
 * A search page.
 *
 * `next` is a url or `null`, and is carried rather than dropped because author
 * folding counts works per author: a fold that read only the first page would
 * report a work count that shrinks as an author gets more popular.
 */
export const gutendexSearchSchema = z.object({
  next: z.string().nullable(),
  results: z.array(gutendexBookSchema),
});
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
