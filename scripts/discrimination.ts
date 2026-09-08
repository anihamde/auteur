#!/usr/bin/env bun
/**
 * `bun scripts/discrimination.ts` — §10.3's blind discrimination.
 *
 * Hold out passages the pipeline did not use, ask a judge model to pick the
 * real one from a pair, and report how often it succeeds. `PRD.md` §10 tracks
 * this and does not gate on it: the target is that a judge picks the real
 * passage **no more than 70%** of the time, and a script that gated a build on
 * a model's opinion would be a measurement standing in for a judgement.
 *
 * It is a script and not a feature, and that is not a packaging choice: it
 * needs data the pipeline deliberately did not use, and building it into a
 * session would mean the session either used the held-out passages or paid to
 * fetch what it then threw away.
 *
 * **[key][net]** — needs `RAMP_ROUTER_API_KEY` and a database with a built
 * card. The held-out selection and the scoring are pure and are tested; the
 * judging is not run in CI.
 */
import { createDb, type Db } from "../packages/db/src/db.ts";

export type Passage = {
  readonly id: string;
  readonly workId: string;
  readonly text: string;
};

/**
 * The passages a card did **not** draw on.
 *
 * The whole validity of the measure rests on this: a judge shown a passage the
 * card was built from is being asked whether the model can recognise its own
 * inputs, which it can, and the number means nothing.
 */
export const heldOut = (
  all: readonly Passage[],
  usedWorkIds: readonly string[],
): Passage[] => {
  const used = new Set(usedWorkIds);
  return all.filter((passage) => !used.has(passage.workId));
};

/** How often the judge picked the real passage. */
export const discrimination = (
  verdicts: readonly { readonly correct: boolean }[],
): number =>
  verdicts.length === 0
    ? 0
    : verdicts.filter((verdict) => verdict.correct).length / verdicts.length;

/** §10's target: at or below this is indistinguishable enough. */
export const TARGET_CEILING = 0.7;

export const verdict = (rate: number): "met" | "missed" =>
  rate <= TARGET_CEILING ? "met" : "missed";

export const render = (rate: number, pairs: number): string =>
  [
    `pairs judged: ${pairs.toString()}`,
    `judge picked the real passage: ${(rate * 100).toFixed(1)}%`,
    `target: at most ${(TARGET_CEILING * 100).toFixed(0)}% — ${verdict(rate)}`,
  ].join("\n");

/** Every passage in the database, and the works the card was built from. */
export const readCorpus = async (
  db: Db,
  cardId: string,
): Promise<{ readonly all: Passage[]; readonly usedWorkIds: string[] }> => {
  const passages = await db.query<{
    id: string;
    work_id: string;
    text: string;
  }>(`SELECT id, work_id, text FROM passages`);
  const card = await db.query<{ sources: { id: string }[] }>(
    `SELECT card->'sources' AS sources FROM style_cards WHERE id = $1`,
    [cardId],
  );
  return {
    all: passages.rows.map((row) => ({
      id: row["id"],
      text: row["text"],
      workId: row["work_id"],
    })),
    usedWorkIds: (card.rows[0]?.["sources"] ?? []).map((source) => source.id),
  };
};

if (import.meta.main) {
  const url = Bun.env["DATABASE_URL"];
  const cardId = Bun.argv[2];
  if (url === undefined || cardId === undefined) {
    process.stderr.write(
      "usage: DATABASE_URL=... bun scripts/discrimination.ts <cardId>\n",
    );
    process.exit(1);
  }
  const db = createDb({ endpoint: "pooled", url });
  const { all, usedWorkIds } = await readCorpus(db, cardId);
  const candidates = heldOut(all, usedWorkIds);
  process.stdout.write(
    `${candidates.length.toString()} held-out passages from ${new Set(
      candidates.map((passage) => passage.workId),
    ).size.toString()} works the card did not use.\n` +
      "Judging needs RAMP_ROUTER_API_KEY and is run by hand — see docs/BASELINE.md.\n",
  );
  await db.close();
}
