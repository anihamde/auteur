import { createDb, type Db } from "@auteur/db/db";
import { identifier } from "@auteur/db/sql";

/**
 * A throwaway database for this package's own suite.
 *
 * `@auteur/test-db` is the harness every store uses, and it is built on this
 * package — it exists to apply the real migrations with the real runner. So
 * `migrations` cannot devDepend on it without a cycle that turbo's task graph
 * refuses, and the package that owns the runner is also the one that has least
 * need of a harness wrapping it: these suites want databases in states
 * `test-db` deliberately never produces, above all an empty one.
 */
const ADMIN_URL =
  Bun.env["AUTEUR_TEST_DATABASE_URL"] ??
  "postgres://auteur@127.0.0.1:55432/postgres";

export type Scratch = {
  readonly db: Db;
  /** A second handle to the same database, for testing concurrency. */
  readonly other: Db;
  readonly url: string;
  readonly close: () => Promise<void>;
};

/** An empty database. Nothing has been migrated into it. */
export const createScratchDatabase = async (): Promise<Scratch> => {
  const name = `auteur_mig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = createDb({ endpoint: "direct", max: 1, url: ADMIN_URL });
  await admin.query(`CREATE DATABASE ${identifier(name)}`);
  await admin.close();

  const parsed = new URL(ADMIN_URL);
  parsed.pathname = `/${name}`;
  const url = parsed.toString();

  const db = createDb({ endpoint: "direct", max: 4, url });
  const other = createDb({ endpoint: "direct", max: 2, url });

  return {
    close: async () => {
      await db.close();
      await other.close();
      const cleanup = createDb({ endpoint: "direct", max: 1, url: ADMIN_URL });
      await cleanup.query(
        `DROP DATABASE IF EXISTS ${identifier(name)} WITH (FORCE)`,
      );
      await cleanup.close();
    },
    db,
    other,
    url,
  };
};
