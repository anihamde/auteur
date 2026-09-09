import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { errorResponseSchema, ROUTES } from "@auteur/api-contract/routes";
import { putCard } from "@auteur/card-store/cards";
import type { StyleCard } from "@auteur/core/style-card";
import type { CorpusProvider } from "@auteur/corpus-gutenberg/provider";
import {
  recordMeasuredWords,
  upsertAuthor,
} from "@auteur/corpus-store/authors";
import { newId } from "@auteur/ids/new-id";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { createApp } from "../../server/_app.ts";

/**
 * `GET /api/authors` against a real database.
 *
 * The providers are injected fixtures: the route's job is the union, the local
 * facts and the detail line, and reaching Gutendex to test any of those would
 * make the suite fail when a third party is slow.
 */

const TOKEN = "a-token-of-at-least-16-chars";
const CHEKHOV = "gutenberg:chekhov-anton-pavlovich-1860";

let harness: TestDb;

beforeAll(async () => {
  harness = await createTestDb();
});

afterAll(async () => {
  await harness.close();
});

const fullText: CorpusProvider = {
  id: "gutenberg",
  kind: "full-text",
  search: async () => [
    {
      birthYear: 1860,
      deathYear: 1904,
      displayName: "Chekhov, Anton Pavlovich",
      id: CHEKHOV,
      kind: "full-text",
      translators: ["Constance Garnett"],
      workCount: 12,
    },
  ],
};

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

const search = async (
  query: string,
  providers: readonly CorpusProvider[] = [fullText],
): Promise<Response> => {
  const app = createApp({ apiToken: TOKEN, db: harness.db, providers });
  return app.request(`/api/authors?q=${encodeURIComponent(query)}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
};

describe("the three §5.3 detail-line states appear as three distinct shapes", () => {
  test("never fetched: the count is knowable, the words are not", async () => {
    const response = await search("chekhov");
    expect(response.status).toBe(200);
    const body = ROUTES.authors.response.parse(await response.json());
    expect(body.results[0]?.detail).toBe("12 works · not yet measured");
    expect(body.results[0]?.measuredWords).toBeUndefined();
  });

  test("corpus measured, no card yet", async () => {
    await upsertAuthor(harness.db, {
      birthYear: 1860,
      deathYear: 1904,
      displayName: "Chekhov, Anton Pavlovich",
      id: CHEKHOV,
      kind: "full-text",
      measuredWords: null,
      provider: "gutenberg",
      workCount: 12,
    });
    await recordMeasuredWords(harness.db, CHEKHOV, 214_000);

    const body = ROUTES.authors.response.parse(
      await (await search("chekhov")).json(),
    );
    expect(body.results[0]?.detail).toBe(
      "12 works · 214,000 words measured · no card yet",
    );
    expect(body.results[0]?.measuredWords).toBe(214_000);
  });

  test("card built: the design's row, with the version and the confidence", async () => {
    // The third state is only reachable because the lookup composes two tables.
    // One that read `authors` alone would say "no card yet" however many cards
    // existed, and this assertion is what catches that.
    await putCard(harness.db, {
      authorId: CHEKHOV,
      buildKey: "authors-route-fixture",
      card: { voice: "dry" } as unknown as StyleCard,
      confidence: 0.86,
      id: newId(),
      provenance: "full-text",
    });
    const body = ROUTES.authors.response.parse(
      await (await search("chekhov")).json(),
    );
    expect(body.results[0]?.detail).toBe(
      "12 works · 214,000 words · card@1, confidence 0.86",
    );
    expect(body.results[0]?.card).toEqual({ confidence: 0.86, version: 1 });
  });
});

describe("the union", () => {
  test("a secondary provider appends rather than reorders", async () => {
    const body = ROUTES.authors.response.parse(
      await (await search("anything", [fullText, secondary])).json(),
    );
    expect(body.results.map((author) => author.kind)).toEqual([
      "full-text",
      "secondary",
    ]);
  });

  test("a provider that throws does not fail the union, and is named", async () => {
    const failing: CorpusProvider = {
      id: "secondary",
      kind: "secondary",
      search: () => Promise.reject(new Error("upstream refused")),
    };
    const response = await search("anything", [fullText, failing]);
    expect(response.status).toBe(200);
    const body = ROUTES.authors.response.parse(await response.json());
    expect(body.results).toHaveLength(1);
    expect(body.unavailable).toEqual(["secondary"]);
  });

  test("every provider failing is 200 with an empty list and the names", async () => {
    // Not a 500: the search worked, and what it found is nothing plus a reason.
    const failing = (id: string): CorpusProvider => ({
      id,
      kind: "secondary",
      search: () => Promise.reject(new Error("down")),
    });
    const response = await search("anything", [failing("a"), failing("b")]);
    expect(response.status).toBe(200);
    const body = ROUTES.authors.response.parse(await response.json());
    expect(body.results).toEqual([]);
    expect(body.unavailable).toEqual(["a", "b"]);
  });
});

describe("the query is parsed, never trusted", () => {
  test("a missing q is 400, not an empty search", async () => {
    const app = createApp({
      apiToken: TOKEN,
      db: harness.db,
      providers: [fullText],
    });
    const response = await app.request("/api/authors", {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe(
      "invalid_input",
    );
  });

  test("an empty q is 400", async () => {
    const response = await search("");
    expect(response.status).toBe(400);
  });
});
