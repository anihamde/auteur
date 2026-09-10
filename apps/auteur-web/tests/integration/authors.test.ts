import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { errorResponseSchema, ROUTES } from "@auteur/api-contract/routes";
import { putCard } from "@auteur/card-store/cards";
import type { StyleCard } from "@auteur/core/style-card";
import {
  recordMeasuredWords,
  upsertAuthor,
} from "@auteur/corpus-store/authors";
import { newId } from "@auteur/ids/new-id";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import { createApp } from "../../server/_app.ts";

/**
 * `GET /api/authors` against the catalogue this system holds.
 *
 * It used to inject provider fixtures, because the route called `gutendex.com`
 * on every keystroke. That host answers a bot challenge to a datacenter
 * address (decision 0023), so the catalogue is imported once and searched
 * here — and these tests seed rows rather than stub a network, which is the
 * same thing the deployment does.
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

const seed = async (
  id: string,
  displayName: string,
  workCount: number,
): Promise<void> => {
  await upsertAuthor(harness.db, {
    birthYear: 1860,
    deathYear: 1904,
    displayName,
    id,
    kind: "full-text",
    measuredWords: null,
    provider: "gutenberg",
    workCount,
  });
};

const search = async (query: string): Promise<Response> => {
  const app = createApp({ apiToken: TOKEN, db: harness.db });
  return app.request(`/api/authors?q=${encodeURIComponent(query)}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
};

const parsed = async (query: string) =>
  ROUTES.authors.response.parse(await (await search(query)).json());

describe("the three §5.3 detail-line states appear as three distinct shapes", () => {
  test("never fetched: the count is knowable, the words are not", async () => {
    await seed(CHEKHOV, "Chekhov, Anton Pavlovich", 12);
    const body = await parsed("chekhov");
    expect(body.results[0]?.detail).toBe("12 works · not yet measured");
    expect(body.results[0]?.measuredWords).toBeUndefined();
  });

  test("corpus measured, no card yet", async () => {
    await recordMeasuredWords(harness.db, CHEKHOV, 214_000);
    const body = await parsed("chekhov");
    expect(body.results[0]?.detail).toBe(
      "12 works · 214,000 words measured · no card yet",
    );
    expect(body.results[0]?.measuredWords).toBe(214_000);
  });

  test("card built: the design's row, with the version and the confidence", async () => {
    // Only reachable because the query composes two tables. One that read
    // `authors` alone would say "no card yet" however many cards existed, and
    // this assertion is what catches that.
    await putCard(harness.db, {
      authorId: CHEKHOV,
      buildKey: "authors-route-fixture",
      card: { voice: "dry" } as unknown as StyleCard,
      confidence: 0.86,
      id: newId(),
      provenance: "full-text",
    });
    const body = await parsed("chekhov");
    expect(body.results[0]?.detail).toBe(
      "12 works · 214,000 words · card@1, confidence 0.86",
    );
    expect(body.results[0]?.card).toEqual({ confidence: 0.86, version: 1 });
  });
});

describe("what a reader types finds what the catalogue stores", () => {
  test("a surname matches a name stored surname-first with forenames after", async () => {
    // The catalogue stores "Chekhov, Anton Pavlovich". A prefix match finds
    // that; a reader typing "anton" gets nothing from one, which is why the
    // query is unanchored.
    expect((await parsed("anton")).results[0]?.id).toBe(CHEKHOV);
  });

  test("case does not matter", async () => {
    expect((await parsed("CHEKHOV")).results[0]?.id).toBe(CHEKHOV);
  });

  test("a name nobody stored finds nothing, and that is not an error", async () => {
    const response = await search("zzzzzznobody");
    expect(response.status).toBe(200);
    const body = ROUTES.authors.response.parse(await response.json());
    expect(body.results).toEqual([]);
  });

  test("the author with more works comes first", async () => {
    // Two people share a surname often. The count is the only thing here that
    // distinguishes the one a reader probably meant, and it is already the
    // number the detail line shows.
    await seed("gutenberg:prolific-a-1860", "Prolific, Ann", 400);
    await seed("gutenberg:prolific-b-1860", "Prolific, Bert", 2);
    expect(
      (await parsed("prolific")).results.map((row) => row.displayName),
    ).toEqual(["Prolific, Ann", "Prolific, Bert"]);
  });
});

describe("nothing is asked of anyone else", () => {
  test("unavailable is empty, because no provider was asked", async () => {
    // The field stays: the screen renders it and a secondary tier (PRD §8) is
    // the shape this grows into. Empty is the honest answer to "which
    // providers failed" when none were called.
    expect((await parsed("chekhov")).unavailable).toEqual([]);
  });
});

describe("the query is parsed, never trusted", () => {
  test("a missing q is 400, not an empty search", async () => {
    const app = createApp({ apiToken: TOKEN, db: harness.db });
    const response = await app.request("/api/authors", {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(await response.json()).error.code).toBe(
      "invalid_input",
    );
  });

  test("an empty q is 400", async () => {
    expect((await search("")).status).toBe(400);
  });

  test("a percent sign is a character, not a wildcard", async () => {
    // It reaches an ILIKE pattern. Bound, so never an injection — and still
    // wrong before this was escaped: `%` became `%%%` and returned every
    // author in the catalogue to someone who typed one character.
    expect((await parsed("%")).results).toEqual([]);
  });

  test("an underscore is a character too", async () => {
    // `_` matches any single character, so "chekho_" would find Chekhov and
    // "_" would find everyone.
    expect((await parsed("_")).results).toEqual([]);
  });
});
