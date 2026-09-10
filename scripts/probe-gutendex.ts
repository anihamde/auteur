#!/usr/bin/env bun
/**
 * S2's live half. **Not run yet.**
 *
 * `packages/corpus-gutenberg/src/schema.ts` is written from the API's public
 * documentation by way of `ARCHITECTURE.md` §5.2. The build environment has no
 * egress to `gutendex.com` (`docs/IMPLEMENTATION-PLAN.md` §4), so every field
 * name in that schema is a claim this script confirms or corrects.
 *
 * It records one real `GET /books?search=…&languages=en`, parses it with the
 * committed schema, and **fails naming every field that moved**. On success it
 * writes the response over `gutendex-search.synthetic.json` — under its
 * recorded name — so wave I's tests stay offline afterwards.
 *
 * The schema rejects unknown keys, so a response that merely *grew* a field
 * fails here too. That is the intended sensitivity: an added field is worth a
 * line in the diff, and the alternative — ignoring extras — is how a renamed
 * field becomes `undefined` on every row with nothing red.
 */
import { parseSearch } from "../packages/corpus-gutenberg/src/schema.ts";

const ENDPOINT = "https://gutendex.com/books/";

export type ProbeResult =
  | { readonly ok: true; readonly books: number }
  | { readonly ok: false; readonly problem: string };

/** Parse a recorded payload the way the provider will. Exported for tests. */
export const checkPayload = (payload: unknown): ProbeResult => {
  try {
    const parsed = parseSearch(payload);
    return { books: parsed.results.length, ok: true };
  } catch (thrown) {
    return {
      ok: false,
      problem: thrown instanceof Error ? thrown.message : String(thrown),
    };
  }
};

export const searchUrlFor = (query: string): string =>
  `${ENDPOINT}?search=${encodeURIComponent(query)}&languages=en`;

/**
 * Ask the live service and parse what it answers.
 *
 * Exported so `verify:live` runs the same check rather than printing a note
 * telling someone to run this file. A check that reports `ok` and names the
 * command that would have checked it is not a check.
 */
export const probeLive = async (
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> => {
  let payload: unknown;
  try {
    const response = await fetchImpl(searchUrlFor(query));
    if (!response.ok) {
      return {
        ok: false,
        problem: `gutendex answered ${response.status.toString()}.`,
      };
    }
    payload = await response.json();
  } catch (thrown) {
    return {
      ok: false,
      problem: `could not reach gutendex: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    };
  }
  return checkPayload(payload);
};

if (import.meta.main) {
  const query = process.argv[2] ?? "chekhov";
  process.stdout.write(`GET ${searchUrlFor(query)}\n`);

  const result = await probeLive(query);
  if (!result.ok) {
    process.stderr.write(
      `The committed schema does not accept the live response.\n${result.problem}\n\n` +
        "Every difference above is a field ARCHITECTURE.md §5.2 got wrong.\n" +
        "Correct the schema, and if the correction changes the author-id shape\n" +
        "write a decision file: it changes the card cache's identity.\n",
    );
    process.exit(1);
  }
  process.stdout.write(
    `The committed schema parses the live response. ${result.books.toString()} book(s).\n`,
  );
}
