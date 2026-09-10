import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  findAuthor,
  recordMeasuredWords,
  upsertAuthor,
} from "@auteur/corpus-store/authors";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import {
  type AuthorResult,
  type CorpusProvider,
  createGutenbergProvider,
  detailLine,
  searchAll,
  withLocalFacts,
} from "../../src/provider.ts";
import fixture from "../fixtures/gutendex-search.synthetic.json" with {
  type: "json",
};

let harness: TestDb;

beforeAll(async () => {
  harness = await createTestDb();
});

afterAll(async () => {
  await harness.close();
});

const respondingWithFixture = () =>
  createGutenbergProvider({
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify({ ...fixture, next: null }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
  });

const CHEKHOV = "gutenberg:chekhov-anton-pavlovich-1860";

/**
 * The lookup the provider takes, backed by the real store.
 *
 * The provider is service-layer and never holds a `Db`; the read lives here,
 * which is where a route or a stage would put it too.
 */
const facts = async (id: string) => findAuthor(harness.db, id);

describe("the three detail-line states", () => {
  const base: AuthorResult = {
    birthYear: 1860,
    deathYear: 1904,
    displayName: "Chekhov, Anton Pavlovich",
    id: CHEKHOV,
    kind: "full-text",
    translators: [],
    workCount: 12,
  };

  test("never fetched: the count is knowable, the words are not", () => {
    // Search-as-you-type cannot download a million words per keystroke, so the
    // line names which part is missing rather than showing a blank.
    expect(detailLine(base)).toBe("12 works · not yet measured");
  });

  test("corpus cached, no card", () => {
    expect(detailLine({ ...base, measuredWords: 214_000 })).toBe(
      "12 works · 214,000 words measured · no card yet",
    );
  });

  test("card cached: the design's row", () => {
    expect(
      detailLine({
        ...base,
        card: { confidence: 0.86, version: 3 },
        measuredWords: 214_000,
      }),
    ).toBe("12 works · 214,000 words · card@3, confidence 0.86");
  });

  test("a zero word count is a measurement, not an absence", () => {
    // The state is decided by whether the field is present, not by its value.
    expect(detailLine({ ...base, measuredWords: 0 })).toContain(
      "0 words measured",
    );
  });
});

describe("local facts come from the tables, and a search never writes", () => {
  test("an author never fetched comes back with no measurement", async () => {
    const results = await respondingWithFixture().search("chekhov");
    const filled = await withLocalFacts(facts, results);
    expect(filled[0]?.measuredWords).toBeUndefined();
    expect(detailLine(filled[0] as AuthorResult)).toContain("not yet measured");
  });

  test("an author with a measured corpus comes back with its word count", async () => {
    await upsertAuthor(harness.db, {
      birthYear: 1860,
      deathYear: 1904,
      displayName: "Chekhov, Anton Pavlovich",
      id: CHEKHOV,
      kind: "full-text",
      measuredWords: null,
      provider: "gutenberg",
      workCount: 3,
    });
    await recordMeasuredWords(harness.db, CHEKHOV, 214_000);

    const filled = await withLocalFacts(
      facts,
      await respondingWithFixture().search("chekhov"),
    );
    expect(filled[0]?.measuredWords).toBe(214_000);
  });

  test("searching does not populate the cache", async () => {
    // Typing an author's name must not fetch their corpus.
    const before = await harness.db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM authors`,
    );
    await respondingWithFixture().search("dickens");
    const after = await harness.db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM authors`,
    );
    expect(after.rows[0]?.["n"]).toBe(before.rows[0]?.["n"] ?? "");
  });
});

describe("the seam", () => {
  test("a secondary provider unions in without the builder changing", async () => {
    // PRD §8's tier is designed and not built. The seam is what makes it a
    // later addition rather than a refactor.
    const secondary: CorpusProvider = {
      id: "secondary",
      kind: "secondary",
      search: async () => [
        {
          birthYear: 1923,
          deathYear: 1985,
          displayName: "Calvino, Italo",
          id: "secondary:calvino-italo-1923",
          kind: "secondary",
          translators: [],
          workCount: 0,
        },
      ],
    };

    const union = await searchAll(
      [respondingWithFixture(), secondary],
      "chekhov",
    );
    expect(union.results.map((author) => author.kind)).toEqual([
      "full-text",
      "secondary",
    ]);
    expect(union.unavailable).toEqual([]);
  });

  test("order is provider order, so adding one appends rather than reshuffles", async () => {
    const empty: CorpusProvider = {
      id: "empty",
      kind: "secondary",
      search: async () => [],
    };
    const withEmptyFirst = await searchAll(
      [empty, respondingWithFixture()],
      "chekhov",
    );
    expect(withEmptyFirst.results[0]?.kind).toBe("full-text");
  });

  test("a provider that throws is named, and the other tier still returns", async () => {
    // One tier being down is an ordinary Tuesday. A search that returns
    // nothing because a third-party service is slow is worse than one that
    // returns the other tier and says which half is missing.
    const failing: CorpusProvider = {
      id: "secondary",
      kind: "secondary",
      search: () =>
        Promise.reject(new Error("upstream refused the connection")),
    };
    const union = await searchAll(
      [respondingWithFixture(), failing],
      "chekhov",
    );
    expect(union.results.length).toBeGreaterThan(0);
    expect(union.unavailable).toEqual(["secondary"]);
  });

  test("every provider failing is an empty list and two names, not a throw", async () => {
    const failing = (id: string): CorpusProvider => ({
      id,
      kind: "secondary",
      search: () => Promise.reject(new Error("down")),
    });
    const union = await searchAll([failing("a"), failing("b")], "chekhov");
    expect(union.results).toEqual([]);
    expect(union.unavailable).toEqual(["a", "b"]);
  });

  test("the reason reaches the caller, not just the name", async () => {
    // "gutenberg unavailable" is the whole of what a screen should say and the
    // whole of what anyone could learn: the rejection was read for its status
    // and dropped. An operator needs the cause, and it was already in hand.
    const seen: { id: string; message: string }[] = [];
    const failing: CorpusProvider = {
      id: "secondary",
      kind: "secondary",
      search: () => Promise.reject(new Error("upstream refused")),
    };

    await searchAll([failing], "chekhov", (id, reason) => {
      seen.push({
        id,
        message: reason instanceof Error ? reason.message : "not an error",
      });
    });

    expect(seen).toEqual([{ id: "secondary", message: "upstream refused" }]);
  });

  test("a provider that answers reports nothing", async () => {
    const seen: string[] = [];
    await searchAll([respondingWithFixture()], "chekhov", (id) => {
      seen.push(id);
    });
    expect(seen).toEqual([]);
  });
});
