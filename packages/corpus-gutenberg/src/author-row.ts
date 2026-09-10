/**
 * One row on the author screen, and the line under it.
 *
 * This was the `CorpusProvider` seam: one implementation, and an interface
 * anyway, because `PRD.md` §8's secondary tier was designed and not built.
 * Search does not call a provider any more — it reads the catalogue this system
 * imported (decision 0023) — so the seam is gone and the two things the screen
 * actually needs are here.
 */

export type AuthorKind = "full-text" | "secondary";

/**
 * `measuredWords` and `card` are **optional, and that is the design**
 * (`ARCHITECTURE.md` §5.3). Two of the four facts the design's row shows are
 * unknowable at search time: a word count requires downloading the texts, and
 * an exemplar count requires a built card. Search-as-you-type cannot download a
 * million words per keystroke.
 *
 * So they are populated from local tables when they are there, and the detail
 * line has three forms. The design's row is the third — correct for the author
 * it shows, which in the mockup is one already built.
 */
export type AuthorResult = {
  readonly id: string;
  readonly displayName: string;
  readonly kind: AuthorKind;
  readonly birthYear: number | null;
  readonly deathYear: number | null;
  readonly workCount: number;
  /** Present once a corpus has been fetched and counted. */
  readonly measuredWords?: number;
  /** Present once a card has been built for this author. */
  readonly card?: { readonly version: number; readonly confidence: number };
};

/**
 * The detail line, in the three states.
 *
 * Assembled here rather than in the screen because the state it names is a fact
 * about the data, and a component deciding which sentence to render would be a
 * component deciding what is known. Degradation names which part is missing —
 * "not yet measured" rather than a blank, and "no card yet" rather than a zero.
 *
 * It takes the three fields it reads rather than a whole `AuthorResult`: the
 * catalogue has no translator list per author, and a caller passing an empty
 * one to satisfy a type would be inventing a fact.
 */
export const detailLine = (
  author: Pick<AuthorResult, "card" | "measuredWords" | "workCount">,
): string => {
  const works = `${author.workCount.toString()} works`;
  if (author.measuredWords === undefined) {
    return `${works} · not yet measured`;
  }
  const measured = `${author.measuredWords.toLocaleString("en-US")} words`;
  if (author.card === undefined) {
    return `${works} · ${measured} measured · no card yet`;
  }
  return `${works} · ${measured} · card@${author.card.version.toString()}, confidence ${author.card.confidence.toFixed(2)}`;
};
