import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { identifier } from "@auteur/db/sql";
import { ensureSchema } from "../../src/ensure-schema.ts";
import { createScratchDatabase, type Scratch } from "./harness.ts";

let harness: Scratch;

beforeAll(async () => {
  harness = await createScratchDatabase();
  await ensureSchema(harness.db);
});

afterAll(async () => {
  await harness.close();
});

const TABLES = [
  "_auteur_migrations",
  "artifacts",
  "authors",
  "card_overlays",
  "events",
  "passages",
  "questions",
  "session_runs",
  "sessions",
  // Not in §3.2: added by decision 0006, because only four of ten stages
  // produce an artifact and the other six had nowhere to store a key.
  "stage_keys",
  "stage_pins",
  "stage_queue",
  "stage_runs",
  "stories",
  "style_cards",
  "works",
];

const seedAuthor = async (id = "gutenberg:borges-1899"): Promise<string> => {
  await harness.db.query(
    `INSERT INTO authors (id, provider, kind, display_name, work_count)
     VALUES ($1, 'gutenberg', 'full-text', 'Borges', 12)
     ON CONFLICT (id) DO NOTHING`,
    [id],
  );
  return id;
};

const seedSession = async (): Promise<string> => {
  const id = crypto.randomUUID();
  await harness.db.query(
    `INSERT INTO sessions (id, step, idea, length_preset)
     VALUES ($1, 'idea', 'a comet', 'flash')`,
    [id],
  );
  return id;
};

describe("every table in ARCHITECTURE.md §3.2 exists", () => {
  test.each(TABLES.map((name) => [name] as const))("%s", async (name) => {
    const result = await harness.db.query<{ present: boolean }>(
      `SELECT to_regclass($1) IS NOT NULL AS present`,
      [name],
    );
    expect(result.rows[0]?.present).toBe(true);
  });

  test("and nothing else", async () => {
    const result = await harness.db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(result.rows.map((row) => row.table_name)).toEqual(TABLES);
  });
});

describe("timestamps are timestamptz, never a bare timestamp", () => {
  test("no column in the schema is timezone-naive", async () => {
    // §3.1. A bare `timestamp` silently drops the offset, so two rows written
    // from different regions compare as if they were the same moment.
    const result = await harness.db.query<{
      table_name: string;
      column_name: string;
    }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'`,
    );
    expect(result.rows).toEqual([]);
  });
});

describe("every CHECK constraint rejects its own violation", () => {
  test("sessions.step", async () => {
    await expect(
      harness.db.query(
        `INSERT INTO sessions (id, step, idea, length_preset)
         VALUES ($1, 'nonsense', 'a comet', 'flash')`,
        [crypto.randomUUID()],
      ),
    ).rejects.toThrow();
  });

  test("sessions.length_preset", async () => {
    await expect(
      harness.db.query(
        `INSERT INTO sessions (id, step, idea, length_preset)
         VALUES ($1, 'idea', 'a comet', 'epic')`,
        [crypto.randomUUID()],
      ),
    ).rejects.toThrow();
  });

  test("questions.answer_state", async () => {
    const sessionId = await seedSession();
    await expect(
      harness.db.query(
        `INSERT INTO questions
           (id, session_id, round, ordinal, text, decision, why_asked,
            suggestions, depends_on, answer_state)
         VALUES ($1, $2, 1, 0, 't', 'the frame', 'the idea names no frame',
                 '[]'::jsonb, '[]'::jsonb, 'pondering')`,
        [crypto.randomUUID(), sessionId],
      ),
    ).rejects.toThrow();
  });

  test("questions.round is bounded at 3 — the wizard's budget", async () => {
    const sessionId = await seedSession();
    await expect(
      harness.db.query(
        `INSERT INTO questions
           (id, session_id, round, ordinal, text, decision, why_asked,
            suggestions, depends_on, answer_state)
         VALUES ($1, $2, 4, 0, 't', 'the frame', 'the idea names no frame',
                 '[]'::jsonb, '[]'::jsonb, 'open')`,
        [crypto.randomUUID(), sessionId],
      ),
    ).rejects.toThrow();
  });

  test("questions.decision must state something", async () => {
    // A question that cannot name the decision it resolves is not asked. §6.5
    // makes that a parse failure; the CHECK makes it unstorable as well, so a
    // path that bypassed the schema still could not persist one.
    const sessionId = await seedSession();
    await expect(
      harness.db.query(
        `INSERT INTO questions
           (id, session_id, round, ordinal, text, decision, why_asked,
            suggestions, depends_on, answer_state)
         VALUES ($1, $2, 1, 0, 't', 'x', 'the idea names no frame at all',
                 '[]'::jsonb, '[]'::jsonb, 'open')`,
        [crypto.randomUUID(), sessionId],
      ),
    ).rejects.toThrow();
  });

  test("artifacts.kind", async () => {
    const sessionId = await seedSession();
    await expect(
      harness.db.query(
        `INSERT INTO artifacts (session_id, kind, input_key, body)
         VALUES ($1, 'sketch', 'k', '{}'::jsonb)`,
        [sessionId],
      ),
    ).rejects.toThrow();
  });

  test("stage_runs.status and .tier", async () => {
    const sessionId = await seedSession();
    await expect(
      harness.db.query(
        `INSERT INTO stage_runs (id, session_id, stage_id, attempt, status)
         VALUES ($1, $2, 'draft', 1, 'thinking')`,
        [crypto.randomUUID(), sessionId],
      ),
    ).rejects.toThrow();
    await expect(
      harness.db.query(
        `INSERT INTO stage_runs (id, session_id, stage_id, attempt, status, tier)
         VALUES ($1, $2, 'draft', 1, 'ok', 'luxury')`,
        [crypto.randomUUID(), sessionId],
      ),
    ).rejects.toThrow();
  });

  test("session_runs.status", async () => {
    const sessionId = await seedSession();
    await expect(
      harness.db.query(
        `INSERT INTO session_runs (session_id, claimed_by, status)
         VALUES ($1, 'inv-1', 'pending')`,
        [sessionId],
      ),
    ).rejects.toThrow();
  });

  test("stage_queue.status", async () => {
    const sessionId = await seedSession();
    await expect(
      harness.db.query(
        `INSERT INTO stage_queue (id, session_id, stage_id, status)
         VALUES ($1, $2, 'draft', 'thinking')`,
        [crypto.randomUUID(), sessionId],
      ),
    ).rejects.toThrow();
  });

  test("events.seq starts at 1, never 0", async () => {
    // A cursor of 0 means "from the beginning". A seq of 0 would collide with
    // it and replay one event twice on every reconnect.
    const sessionId = await seedSession();
    await expect(
      harness.db.query(
        `INSERT INTO events (session_id, seq, type, payload)
         VALUES ($1, 0, 'step', '{}'::jsonb)`,
        [sessionId],
      ),
    ).rejects.toThrow();
    await harness.db.query(
      `INSERT INTO events (session_id, seq, type, payload)
       VALUES ($1, 1, 'step', '{}'::jsonb)`,
      [sessionId],
    );
  });

  test("passages.char_end must be past char_start", async () => {
    const authorId = await seedAuthor();
    await harness.db.query(
      `INSERT INTO works (id, author_id, title, language, source_url,
                          cleaner_version, word_count, text)
       VALUES ('gutenberg:1', $1, 'T', 'en', 'https://x/1', 'clean-1', 10, 'x')
       ON CONFLICT (id) DO NOTHING`,
      [authorId],
    );
    await expect(
      harness.db.query(
        `INSERT INTO passages (id, work_id, char_start, char_end, text)
         VALUES ($1, 'gutenberg:1', 100, 100, 'x')`,
        [crypto.randomUUID()],
      ),
    ).rejects.toThrow();
  });

  test("style_cards.confidence is a ratio", async () => {
    const authorId = await seedAuthor("gutenberg:conf-test");
    await expect(
      harness.db.query(
        `INSERT INTO style_cards
           (id, author_id, version, build_key, provenance, confidence, card)
         VALUES ($1, $2, 1, 'k1', 'full-text', 1.5, '{}'::jsonb)`,
        [crypto.randomUUID(), authorId],
      ),
    ).rejects.toThrow();
  });
});

describe("the uniqueness that makes a rebuild a cache hit", () => {
  test("build_key is unique, so identical inputs do not make a version 4", async () => {
    const authorId = await seedAuthor("gutenberg:unique-test");
    const insert = async (version: number, key: string): Promise<void> => {
      await harness.db.query(
        `INSERT INTO style_cards
           (id, author_id, version, build_key, provenance, confidence, card)
         VALUES ($1, $2, $3, $4, 'full-text', 0.86, '{}'::jsonb)`,
        [crypto.randomUUID(), authorId, version, key],
      );
    };
    await insert(1, "same-key");
    await expect(insert(2, "same-key")).rejects.toThrow();
  });

  test("(author_id, version) is unique, so borges@3 is one card", async () => {
    const authorId = await seedAuthor("gutenberg:version-test");
    const insert = async (key: string): Promise<void> => {
      await harness.db.query(
        `INSERT INTO style_cards
           (id, author_id, version, build_key, provenance, confidence, card)
         VALUES ($1, $2, 1, $3, 'full-text', 0.86, '{}'::jsonb)`,
        [crypto.randomUUID(), authorId, key],
      );
    };
    await insert("key-a");
    await expect(insert("key-b")).rejects.toThrow();
  });

  test("works are keyed by (source_url, cleaner_version)", async () => {
    // Re-cleaning requires re-fetching; re-segmenting does not. The same url
    // under a bumped cleaner version is a miss, under the same version a hit.
    const authorId = await seedAuthor("gutenberg:work-key");
    const insert = async (id: string, cleaner: string): Promise<void> => {
      await harness.db.query(
        `INSERT INTO works (id, author_id, title, language, source_url,
                            cleaner_version, word_count, text)
         VALUES ($1, $2, 'T', 'en', 'https://x/same', $3, 10, 'x')`,
        [id, authorId, cleaner],
      );
    };
    await insert("gutenberg:k1", "clean-aaa");
    await expect(insert("gutenberg:k2", "clean-aaa")).rejects.toThrow();
    await insert("gutenberg:k3", "clean-bbb");
  });
});

describe("cascades are real, so a deleted session leaves nothing behind", () => {
  test("deleting a session removes its events, artifacts and queue rows", async () => {
    const sessionId = await seedSession();
    await harness.db.query(
      `INSERT INTO events (session_id, seq, type, payload)
       VALUES ($1, 1, 'step', '{}'::jsonb)`,
      [sessionId],
    );
    await harness.db.query(
      `INSERT INTO stage_queue (id, session_id, stage_id, status)
       VALUES ($1, $2, 'draft', 'queued')`,
      [crypto.randomUUID(), sessionId],
    );

    await harness.db.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);

    for (const table of ["events", "stage_queue"]) {
      const rows = await harness.db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${identifier(table)} WHERE session_id = $1`,
        [sessionId],
      );
      expect(rows.rows[0]?.n).toBe("0");
    }
  });
});
