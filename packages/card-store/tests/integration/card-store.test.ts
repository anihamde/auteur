import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { StyleCard } from "@auteur/core/style-card";
import { newId } from "@auteur/ids/new-id";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import {
  findCardByBuildKey,
  latestCardForAuthor,
  putCard,
} from "../../src/cards.ts";
import { clearOverlay, findOverlay, putOverlay } from "../../src/overlays.ts";

let harness: TestDb;

beforeAll(async () => {
  harness = await createTestDb();
});

afterAll(async () => {
  await harness.close();
});

const seedAuthor = async (id: string): Promise<string> => {
  await harness.db.query(
    `INSERT INTO authors (id, provider, kind, display_name, work_count)
     VALUES ($1, 'gutenberg', 'full-text', 'Borges', 12)
     ON CONFLICT (id) DO NOTHING`,
    [id],
  );
  return id;
};

// The store treats the card as an opaque jsonb document — it is parsed at the
// boundaries that build and render it, not here — so the fixture only needs to
// round-trip.
const aCard = (voice: string) => ({ voice }) as unknown as StyleCard;

const write = (authorId: string, buildKey: string, voice = "dry") => ({
  authorId,
  buildKey,
  card: aCard(voice),
  confidence: 0.86,
  id: newId(),
  provenance: "full-text" as const,
});

describe("a cache hit is a build_key match", () => {
  test("identical inputs return the existing row and do not make a version 2", async () => {
    // §4.4. Same author, same works, same toolchain, same prompt, same model:
    // same card. A second version here would give the UI two identities for
    // one thing and make `borges@3` meaningless.
    const author = await seedAuthor("gutenberg:hit");
    const first = await putCard(harness.db, write(author, "key-same"));
    expect(first.inserted).toBe(true);
    expect(first.card.version).toBe(1);

    const second = await putCard(
      harness.db,
      write(author, "key-same", "different in the payload, same key"),
    );
    expect(second.inserted).toBe(false);
    expect(second.card.id).toBe(first.card.id);
    expect(second.card.version).toBe(1);
    // The stored card is the first build, not the second's payload.
    expect(second.card.card).toEqual(first.card.card);
  });

  test("a genuinely new key gets max(version) + 1 for that author", async () => {
    const author = await seedAuthor("gutenberg:versions");
    const one = await putCard(harness.db, write(author, "v-a"));
    const two = await putCard(harness.db, write(author, "v-b"));
    const three = await putCard(harness.db, write(author, "v-c"));
    expect([one, two, three].map((result) => result.card.version)).toEqual([
      1, 2, 3,
    ]);
    expect((await latestCardForAuthor(harness.db, author))?.version).toBe(3);
  });

  test("versions are per author, not global", async () => {
    const first = await seedAuthor("gutenberg:per-a");
    const second = await seedAuthor("gutenberg:per-b");
    await putCard(harness.db, write(first, "per-a-1"));
    await putCard(harness.db, write(first, "per-a-2"));
    const other = await putCard(harness.db, write(second, "per-b-1"));
    expect(other.card.version).toBe(1);
  });

  test("two builds racing the same key both end with the stored card", async () => {
    // Two research stages for one author finish together. Neither may see an
    // error, and both must return the same identity — otherwise one session
    // renders a card the database does not hold.
    const author = await seedAuthor("gutenberg:race");
    const [a, b] = await Promise.all([
      putCard(harness.db, write(author, "race-key")),
      putCard(harness.other, write(author, "race-key")),
    ]);
    expect(a.card.id).toBe(b.card.id);
    expect([a.inserted, b.inserted].filter(Boolean)).toHaveLength(1);
    expect((await findCardByBuildKey(harness.db, "race-key"))?.id).toBe(
      a.card.id,
    );
  });

  test("cards are never updated in place, so an old session keeps its card", async () => {
    const author = await seedAuthor("gutenberg:immutable");
    const original = await putCard(harness.db, write(author, "imm-1", "dry"));
    await putCard(harness.db, write(author, "imm-2", "florid"));

    const stored = await findCardByBuildKey(harness.db, "imm-1");
    expect(stored?.id).toBe(original.card.id);
    expect(stored?.card).toEqual(original.card.card);
  });
});

describe("an overlay is per session and does not touch the card", () => {
  test("editing a field leaves the shared card untouched", async () => {
    const author = await seedAuthor("gutenberg:overlay");
    const built = await putCard(harness.db, write(author, "overlay-key"));
    const seeded = await harness.db.query<{ id: string }>(
      `INSERT INTO sessions (id, step, idea, length_preset)
       VALUES ($1, 'research', 'a comet', 'flash') RETURNING id`,
      [newId()],
    );
    const sessionId = seeded.rows[0]?.["id"] ?? "";

    await putOverlay(harness.db, {
      cardId: built.card.id,
      fields: { voice: "edited by hand" } as never,
      sessionId,
    });

    expect((await findOverlay(harness.db, sessionId))?.fields).toEqual({
      voice: "edited by hand",
    } as never);
    expect((await findCardByBuildKey(harness.db, "overlay-key"))?.card).toEqual(
      built.card.card,
    );
  });

  test("clearing the overlay is what reverting to the card means", async () => {
    const author = await seedAuthor("gutenberg:revert");
    const built = await putCard(harness.db, write(author, "revert-key"));
    const seeded = await harness.db.query<{ id: string }>(
      `INSERT INTO sessions (id, step, idea, length_preset)
       VALUES ($1, 'research', 'a comet', 'flash') RETURNING id`,
      [newId()],
    );
    const sessionId = seeded.rows[0]?.["id"] ?? "";
    await putOverlay(harness.db, {
      cardId: built.card.id,
      fields: { voice: "x" } as never,
      sessionId,
    });

    expect(await clearOverlay(harness.db, sessionId)).toBe(true);
    expect(await findOverlay(harness.db, sessionId)).toBeUndefined();
    expect(await clearOverlay(harness.db, sessionId)).toBe(false);
  });
});
