import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { newId } from "@auteur/ids/new-id";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import {
  findAuthor,
  recordMeasuredWords,
  upsertAuthor,
} from "../../src/authors.ts";
import {
  findPassages,
  listPassagesForWork,
  putPassages,
} from "../../src/passages.ts";
import {
  catalogueWorksFor,
  findWorkBySource,
  listWorksByAuthor,
  putWork,
} from "../../src/works.ts";

let harness: TestDb;

beforeAll(async () => {
  harness = await createTestDb();
});

afterAll(async () => {
  await harness.close();
});

const anAuthor = (id: string) => ({
  birthYear: 1899,
  deathYear: 1986,
  displayName: "Jorge Luis Borges",
  id,
  kind: "full-text" as const,
  measuredWords: null,
  provider: "gutenberg" as const,
  workCount: 12,
});

const aWork = (
  id: string,
  authorId: string,
  sourceUrl: string,
  cleanerVersion: string,
) => ({
  authorId,
  cleanerVersion,
  id,
  language: "en",
  sourceUrl,
  text: "The lamp turned. The sea did not.",
  title: "Ficciones",
  translator: null,
  wordCount: 7,
  year: 1944,
});

describe("the cache key is (source_url, cleaner_version)", () => {
  test("the same url under the same cleaner is a hit", async () => {
    const author = await upsertAuthor(harness.db, anAuthor("gutenberg:hit"));
    await putWork(
      harness.db,
      aWork("gutenberg:hit-1", author.id, "https://x/hit", "clean-1"),
    );

    const found = await findWorkBySource(
      harness.db,
      "https://x/hit",
      "clean-1",
    );
    expect(found?.id).toBe("gutenberg:hit-1");
    expect(found?.text).toBe("The lamp turned. The sea did not.");
  });

  test("the same url under a bumped cleaner is a miss, so it is re-fetched", async () => {
    // Cleaning is what turns a download into text a measurement can be trusted
    // on. Bumping the cleaner has to invalidate the stored text; bumping the
    // segmenter does not, because segmenting runs over the stored text. Keying
    // on the cleaner alone is what keeps those two costs apart.
    const author = await upsertAuthor(harness.db, anAuthor("gutenberg:bump"));
    await putWork(
      harness.db,
      aWork("gutenberg:bump-1", author.id, "https://x/bump", "clean-1"),
    );

    expect(
      await findWorkBySource(harness.db, "https://x/bump", "clean-2"),
    ).toBeUndefined();

    await putWork(
      harness.db,
      aWork("gutenberg:bump-2", author.id, "https://x/bump", "clean-2"),
    );
    const both = await listWorksByAuthor(harness.db, author.id, "clean-1");
    expect(both).toHaveLength(1);
    expect(
      await listWorksByAuthor(harness.db, author.id, "clean-2"),
    ).toHaveLength(1);
  });

  test("re-storing a work that is already cached returns the stored row, not an error", async () => {
    // Two research stages for the same author can fetch the same work at once.
    // The second must find the first's row rather than failing on the unique
    // constraint — a user-visible error for something that went right.
    const author = await upsertAuthor(harness.db, anAuthor("gutenberg:race"));
    const first = await putWork(
      harness.db,
      aWork("gutenberg:race-1", author.id, "https://x/race", "clean-1"),
    );
    const second = await putWork(
      harness.db,
      aWork("gutenberg:race-2", author.id, "https://x/race", "clean-1"),
    );
    expect(second.id).toBe(first.id);
    expect(second.fetchedAt).toEqual(first.fetchedAt);
  });
});

describe("an author's measurement is this system's, not the provider's", () => {
  test("a refresh from upstream does not clear measured_words", async () => {
    // `work_count` is what gutendex says. `measured_words` is what this system
    // counted after cleaning. A refresh that carried the provider's null over
    // the measurement would silently re-run the whole corpus assembly.
    const author = await upsertAuthor(harness.db, anAuthor("gutenberg:meas"));
    await recordMeasuredWords(harness.db, author.id, 912_004);

    await upsertAuthor(harness.db, {
      ...anAuthor("gutenberg:meas"),
      workCount: 14,
    });

    const after = await findAuthor(harness.db, author.id);
    expect(after?.measuredWords).toBe(912_004);
    expect(after?.workCount).toBe(14);
  });

  test("upstream metadata that moved is followed", async () => {
    await upsertAuthor(harness.db, anAuthor("gutenberg:moved"));
    await upsertAuthor(harness.db, {
      ...anAuthor("gutenberg:moved"),
      deathYear: 1985,
    });
    expect((await findAuthor(harness.db, "gutenberg:moved"))?.deathYear).toBe(
      1985,
    );
  });
});

describe("the catalogue is the candidate list corpus-select reads", () => {
  test("only the asked-for author's rows come back, in title order", async () => {
    // The catalogue holds every author at once, so an unscoped or unordered
    // read would offer `corpus-select` another writer's books and make the
    // twelve it chooses depend on insertion order.
    const borges = `gutenberg:borges-${newId()}`;
    const other = `gutenberg:other-${newId()}`;
    await upsertAuthor(harness.db, anAuthor(borges));
    await upsertAuthor(harness.db, anAuthor(other));
    await harness.db.query(
      `INSERT INTO catalogue_works (id, author_id, title, language, source_url)
       VALUES ($1, $2, 'The Steppe', 'en', 'https://example.invalid/b2.txt'),
              ($3, $2, 'A Personal Anthology', 'en', 'https://example.invalid/b1.txt'),
              ($4, $5, 'Somebody Else', 'en', 'https://example.invalid/o1.txt')`,
      [`${borges}:2`, borges, `${borges}:1`, `${other}:1`, other],
    );

    const candidates = await catalogueWorksFor(harness.db, borges);
    expect(candidates.map((candidate) => candidate.title)).toEqual([
      "A Personal Anthology",
      "The Steppe",
    ]);
    expect(candidates[0]?.sourceUrl).toBe("https://example.invalid/b1.txt");
  });

  test("the candidate list is bounded, and the cut spreads across the œuvre", async () => {
    // The list goes into a prompt. Unbounded, its size is a property of
    // whichever author was typed — a compilation credited to one editor runs to
    // hundreds of entries. Taking the first N titles alphabetically would be
    // bounded and wrong in a second way: `corpus-select` is instructed to
    // sample across a career, and everything after "M" would never be offered.
    const prolific = `gutenberg:prolific-${newId()}`;
    await upsertAuthor(harness.db, anAuthor(prolific));
    const titles = Array.from({ length: 40 }, (_, index) =>
      String.fromCodePoint(97 + (index % 26))
        .repeat(3)
        .concat(index.toString()),
    );
    await harness.db.query(
      `INSERT INTO catalogue_works (id, author_id, title, language, source_url)
       SELECT $1 || '-' || ordinality::text, $2, title, 'en',
              'https://example.invalid/' || ordinality::text || '.txt'
         FROM unnest($3::text[]) WITH ORDINALITY AS t(title, ordinality)`,
      [prolific, prolific, titles],
    );

    const capped = await catalogueWorksFor(harness.db, prolific, 10);
    expect(capped).toHaveLength(10);
    // Alphabetical truncation would return ten titles starting with "a" or
    // "b"; a sample returns letters from across the list.
    const initials = new Set(capped.map((c) => c.title[0]));
    expect(initials.size).toBeGreaterThan(2);
    // What survives is still presented in title order.
    expect(capped.map((c) => c.title)).toEqual(
      [...capped.map((c) => c.title)].sort(),
    );
  });

  test("a work with no title is not a candidate", async () => {
    // `catalogue_works.title` is NOT NULL and admits an empty string, and the
    // import writes the CSV's Title column verbatim. Offered, such a row goes
    // into a prompt as a blank line and into the stage's detail lines as
    // " — because…" — and `corpus-select` cannot reason about it either way.
    const patchy = `gutenberg:patchy-${newId()}`;
    await upsertAuthor(harness.db, anAuthor(patchy));
    await harness.db.query(
      `INSERT INTO catalogue_works (id, author_id, title, language, source_url)
       VALUES ($1, $2, '', 'en', 'https://example.invalid/p0.txt'),
              ($3, $2, 'A Real Title', 'en', 'https://example.invalid/p1.txt')`,
      [`${patchy}:0`, patchy, `${patchy}:1`],
    );

    expect(
      (await catalogueWorksFor(harness.db, patchy)).map((c) => c.title),
    ).toEqual(["A Real Title"]);
  });

  test("an author the import never saw is an empty list, not an error", async () => {
    const unknown = `gutenberg:unknown-${newId()}`;
    await upsertAuthor(harness.db, anAuthor(unknown));
    expect(await catalogueWorksFor(harness.db, unknown)).toEqual([]);
  });
});

describe("passages", () => {
  test("deleting a work cascades its passages", async () => {
    // A card cites a passage by id. If passages outlived their work the
    // citation would resolve to text no work claims, which is invariant 2
    // failing in the one way a reader could not detect.
    const author = await upsertAuthor(harness.db, anAuthor("gutenberg:casc"));
    const work = await putWork(
      harness.db,
      aWork("gutenberg:casc-1", author.id, "https://x/casc", "clean-1"),
    );
    await putPassages(harness.db, [
      {
        charEnd: 20,
        charStart: 0,
        id: newId(),
        text: "The lamp turned.",
        workId: work.id,
      },
    ]);
    expect(await listPassagesForWork(harness.db, work.id)).toHaveLength(1);

    await harness.db.query(`DELETE FROM works WHERE id = $1`, [work.id]);
    expect(await listPassagesForWork(harness.db, work.id)).toEqual([]);
  });

  test("a batch is one statement and stays in offset order", async () => {
    const author = await upsertAuthor(harness.db, anAuthor("gutenberg:batch"));
    const work = await putWork(
      harness.db,
      aWork("gutenberg:batch-1", author.id, "https://x/batch", "clean-1"),
    );
    const ids = [newId(), newId(), newId()];
    await putPassages(
      harness.db,
      // Deliberately out of order going in: the read orders by offset.
      [200, 0, 100].map((start, index) => ({
        charEnd: start + 50,
        charStart: start,
        id: ids[index] ?? newId(),
        text: `at ${start.toString()}`,
        workId: work.id,
      })),
    );
    const stored = await listPassagesForWork(harness.db, work.id);
    expect(stored.map((passage) => passage.charStart)).toEqual([0, 100, 200]);
  });

  test("citations are resolved by id across works in one query", async () => {
    const author = await upsertAuthor(harness.db, anAuthor("gutenberg:cite"));
    const works = await Promise.all(
      [1, 2].map(async (n) =>
        putWork(
          harness.db,
          aWork(
            `gutenberg:cite-${n.toString()}`,
            author.id,
            `https://x/cite-${n.toString()}`,
            "clean-1",
          ),
        ),
      ),
    );
    const ids = works.map(() => newId());
    await putPassages(
      harness.db,
      works.map((work, index) => ({
        charEnd: 60,
        charStart: 10,
        id: ids[index] ?? newId(),
        text: `from ${work.id}`,
        workId: work.id,
      })),
    );

    const found = await findPassages(harness.db, ids);
    expect(found).toHaveLength(2);
    expect(new Set(found.map((passage) => passage.workId))).toEqual(
      new Set(works.map((work) => work.id)),
    );
  });

  test("an empty batch is not a statement at all", async () => {
    // `unnest` of five empty arrays would insert nothing anyway, but an
    // `IN ()` would be a syntax error — so the guard is worth having and worth
    // asserting, since the empty case is the one a caller hits first.
    await putPassages(harness.db, []);
    expect(await findPassages(harness.db, [])).toEqual([]);
  });
});
