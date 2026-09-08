import { createDb, type Db } from "../../src/db.ts";
import { identifier } from "../../src/sql.ts";

/**
 * A throwaway database for this package's own suite.
 *
 * `@auteur/test-db` is the harness everything else uses, and it is built on
 * `db` and `migrations` — so `db` cannot depend on it without a cycle that
 * turbo's task graph refuses. `db` is the bottom of the stack, it needs no
 * schema, and creating a database is nine lines.
 */
const ADMIN_URL =
  Bun.env["AUTEUR_TEST_DATABASE_URL"] ??
  "postgres://auteur@127.0.0.1:55432/postgres";

export type Scratch = {
  readonly db: Db;
  readonly other: Db;
  readonly url: string;
  readonly close: () => Promise<void>;
};

export const createScratchDatabase = async (): Promise<Scratch> => {
  const name = `auteur_db_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = createDb({ endpoint: "direct", max: 1, url: ADMIN_URL });
  await admin.query(`CREATE DATABASE ${identifier(name)}`);
  await admin.close();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const scratch = url.toString();

  const db = createDb({ endpoint: "direct", max: 4, url: scratch });
  const other = createDb({ endpoint: "direct", max: 2, url: scratch });

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
    url: scratch,
  };
};

export const pooledHandleTo = (url: string): Db =>
  createDb({ endpoint: "pooled", max: 1, url });
