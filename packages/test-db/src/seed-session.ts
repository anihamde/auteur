import type { Db } from "@auteur/db/db";

/**
 * The one session fixture every store and route suite builds on.
 *
 * Deterministic by construction: ids are derived from a caller-supplied label
 * rather than generated, so a failing assertion names a row the reader can find
 * again, and re-seeding the same label in the same database is a conflict
 * rather than a second silent row. Two suites running in parallel are isolated
 * by having their own database (see `createTestDb`), not by unique ids — so
 * repeating an id across suites is fine and repeating one inside a suite is a
 * bug the primary key should surface.
 */

/** A uuid derived from `label`, stable across runs and machines. */
export const fixtureId = (label: string): string => {
  const digest = new Bun.CryptoHasher("sha256").update(label).digest("hex");
  // Version 4, variant 10xx — a valid uuid Postgres will accept, whose bits
  // happen to be a hash rather than randomness.
  const variant = (
    (Number.parseInt(digest.slice(16, 17), 16) & 0x3) |
    0x8
  ).toString(16);
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `${variant}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
};

export type SeededSession = {
  readonly sessionId: string;
  readonly authorId: string;
  readonly workId: string;
};

export type SeedOptions = {
  /** Distinguishes one seeded session from another inside a suite. */
  readonly label?: string;
  readonly step?: string;
  readonly lengthPreset?: string;
};

/**
 * Insert one session, one author and one work, and return their ids.
 *
 * Deliberately not a whole pipeline run: a fixture that seeds every table makes
 * every test depend on every column, so a schema change breaks suites that
 * never read the column that changed. Anything past these three rows belongs to
 * the suite that needs it.
 */
export const seedSession = async (
  db: Db,
  options: SeedOptions = {},
): Promise<SeededSession> => {
  const label = options.label ?? "default";
  const sessionId = fixtureId(`session:${label}`);
  const authorId = `gutenberg:fixture-${label}`;
  const workId = `gutenberg:fixture-${label}-1`;

  await db.query(
    `INSERT INTO sessions (id, step, idea, length_preset)
     VALUES ($1, $2, $3, $4)`,
    [
      sessionId,
      options.step ?? "idea",
      "a lighthouse keeper who has never seen the sea",
      options.lengthPreset ?? "flash",
    ],
  );
  await db.query(
    `INSERT INTO authors (id, provider, kind, display_name, work_count)
     VALUES ($1, 'gutenberg', 'full-text', $2, 1)`,
    [authorId, `Fixture ${label}`],
  );
  await db.query(
    `INSERT INTO works (id, author_id, title, language, source_url,
                        cleaner_version, word_count, text)
     VALUES ($1, $2, 'A Fixture Work', 'en', $3, 'clean-fixture', 6, $4)`,
    [
      workId,
      authorId,
      `https://fixtures.invalid/${label}`,
      "The lamp turned. The sea did not.",
    ],
  );

  return { authorId, sessionId, workId };
};
