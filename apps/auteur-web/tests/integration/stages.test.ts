import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { findCard } from "@auteur/card-store/cards";
import { prosodyBlockSchema } from "@auteur/core/prosody";
import { CLAIM_PATHS, EXEMPLARS } from "@auteur/core/style-card";
import { AuteurError } from "@auteur/errors/auteur-error";
import { newId } from "@auteur/ids/new-id";
import {
  createSession,
  requireSession,
  updateSession,
} from "@auteur/session-store/sessions";
import { recordStageKey } from "@auteur/session-store/stage-keys";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import {
  createScriptedProvider,
  respondingWith,
  SCRIPTED_MODELS,
  type ScriptedTurn,
} from "@auteur/test-support/scripted-provider";
import { z } from "zod";
import { createStageBody } from "../../server/_stages/index.ts";
import { corpusCandidateSchema } from "../../server/_stages/research.ts";

/** `corpus-select`'s return value, parsed rather than cast. */
const corpusSelectionShape = z.object({
  books: z.array(corpusCandidateSchema),
  chosen: z.array(z.object({ id: z.string(), why: z.string() })),
});

/**
 * The stage bodies against a scripted provider and a fixture corpus.
 *
 * No gateway and no network: a stage body's job is to read the right rows,
 * build one prompt, parse what comes back and write the result, and every one
 * of those is assertable without a model. What a real model does is WP-X0's
 * question, not this suite's.
 */

const AUTHOR = "gutenberg:chekhov-anton-pavlovich-1860";
const WORK = "gutenberg:1";

let harness: TestDb;
let sessionId: string;

beforeAll(async () => {
  harness = await createTestDb();
  await harness.db.query(
    `INSERT INTO authors (id, provider, kind, display_name, work_count)
     VALUES ($1, 'gutenberg', 'full-text', 'Chekhov, Anton Pavlovich', 12)`,
    [AUTHOR],
  );
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  const session = await createSession(harness.db, {
    id: newId(),
    idea: "a lighthouse keeper who has never seen the sea",
    lengthPreset: "flash",
  });
  sessionId = session.id;
  await updateSession(harness.db, sessionId, { authorId: AUTHOR });
});

const emitted: string[] = [];
const run = async (
  stageId: string,
  script: readonly ScriptedTurn[],
): Promise<unknown> => {
  emitted.length = 0;
  const body = createStageBody({
    provider: createScriptedProvider(script),
  });
  return body({
    db: harness.db,
    emit: async (event) => {
      emitted.push(event.type);
    },
    sessionId,
    stageId,
  });
};

/** Prose long enough for MATTR and the sentence distribution to mean anything. */
const CORPUS_TEXT = Array.from(
  { length: 400 },
  (_, index) =>
    `The lamp turned through the fog for the ${index.toString()} time. He had never once walked down to the water; his father had, and had not come back.`,
).join("\n\n");

const seedCorpus = async (): Promise<void> => {
  await harness.db.query(
    `INSERT INTO works (id, author_id, title, language, source_url,
                        cleaner_version, word_count, text)
     VALUES ($1, $2, 'Ward No. 6', 'en', $3, $4, 12000, $5)
     ON CONFLICT (source_url, cleaner_version) DO NOTHING`,
    [
      WORK,
      AUTHOR,
      "https://example.invalid/1.txt",
      (await import("@auteur/text/version")).cleanerVersion(),
      CORPUS_TEXT,
    ],
  );
};

describe("corpus-select", () => {
  const seedCatalogue = async (): Promise<void> => {
    await harness.db.query(
      `INSERT INTO catalogue_works (id, author_id, title, language, source_url)
       VALUES ($1, $2, 'Ward No. 6', 'en', 'https://example.invalid/1.txt'),
              ($3, $2, 'The Steppe', 'en', 'https://example.invalid/2.txt')
       ON CONFLICT (author_id, id) DO NOTHING`,
      [WORK, AUTHOR, "gutenberg:2"],
    );
  };

  test("the candidates are the catalogue's rows, and one never offered is dropped", async () => {
    // Decision 0023: the corpus index is held here rather than searched live,
    // so the `sourceUrl` the stage hands `work-fetch` is the catalogue's. A
    // hallucinated id would become a 404 in `work-fetch` two minutes later.
    await seedCatalogue();
    const selection = corpusSelectionShape.parse(
      await run("corpus-select", [
        respondingWith({
          chosen: [
            { id: "gutenberg:99999", why: "invented" },
            { id: WORK, why: "real" },
          ],
        }),
      ]),
    );
    expect(selection.chosen.map((entry) => entry.id)).toEqual([WORK]);
    expect(selection.books.map((candidate) => candidate.sourceUrl)).toEqual([
      "https://example.invalid/1.txt",
    ]);
  });

  test("an author with no catalogued works is corpus_unavailable", async () => {
    await harness.db.query(
      `INSERT INTO authors (id, provider, kind, display_name, work_count)
       VALUES ('gutenberg:uncatalogued', 'gutenberg', 'full-text', 'Nobody', 0)
       ON CONFLICT (id) DO NOTHING`,
    );
    await updateSession(harness.db, sessionId, {
      authorId: "gutenberg:uncatalogued",
    });
    await expect(
      run("corpus-select", [respondingWith({ chosen: [] })]),
    ).rejects.toThrow(/catalogue holds no English works/i);
  });
});

describe("prosody-compute", () => {
  test("it measures the fetched corpus and calls no model", async () => {
    // Invariant 1: a measurement is never an opinion. This stage has no tier
    // and no model, and the scripted provider is handed an empty script — a
    // model call would exhaust it and throw.
    await seedCorpus();
    const block = prosodyBlockSchema.parse(await run("prosody-compute", []));
    expect(block.sentenceLength.mean).toBeGreaterThan(0);
    expect(Object.keys(block.perWork)).toEqual([WORK]);
  });

  test("with no fetched works it is corpus_unavailable, not an empty block", async () => {
    // An empty measurement would flow into a card and be scored against.
    // A second author, because `works` are author-scoped and the suite's other
    // cases have seeded the first one's corpus by now.
    await harness.db.query(
      `INSERT INTO authors (id, provider, kind, display_name, work_count)
       VALUES ('gutenberg:unfetched', 'gutenberg', 'full-text', 'Nobody', 0)
       ON CONFLICT (id) DO NOTHING`,
    );
    await updateSession(harness.db, sessionId, {
      authorId: "gutenberg:unfetched",
    });
    await expect(run("prosody-compute", [])).rejects.toThrow(
      /no fetched works/i,
    );
  });
});

describe("the card is read in two passes", () => {
  /**
   * Every path the card schema requires, because it requires all of them.
   *
   * A partial extraction is not a smaller card — `buildCard` refuses it — and a
   * fixture with two fields would have been testing the refusal rather than
   * the build. Taken from `CLAIM_PATHS` so a card gaining a required field
   * fails here, which is where it should.
   */
  const someFields = (passageId: string) => ({
    fields: CLAIM_PATHS.map((claim) => ({
      // A corpus claim carries no citation and is written anyway; a passage
      // claim without one is dropped and the card is short of it (0030).
      citationPassageId: claim.evidence === "corpus" ? null : passageId,
      path: claim.path,
      value:
        claim.kind === "list"
          ? ["as measured"]
          : claim.path === "voice.pov"
            ? "third person limited"
            : "as measured",
    })),
  });

  const someExemplars = (passageId: string) => ({
    exemplars: Array.from({ length: EXEMPLARS.min }, (_, index) => ({
      demonstrates: `a habit, number ${index.toString()}`,
      passageId,
    })),
  });

  const seedPassage = async (): Promise<string> => {
    const id = newId();
    await harness.db.query(
      `INSERT INTO passages (id, work_id, char_start, char_end, text)
       VALUES ($1, $2, 0, 400, $3)`,
      [id, WORK, CORPUS_TEXT.slice(0, 400)],
    );
    return id;
  };

  /** Both passes, in order, with the first's output stored as the queue would. */
  const bothPasses = async (passageId: string): Promise<void> => {
    const block = prosodyBlockSchema.parse(await run("prosody-compute", []));
    await recordStageKey(harness.db, sessionId, "prosody-compute", "k", block);
    const fields = await run("style-fields", [
      respondingWith(someFields(passageId)),
    ]);
    await recordStageKey(harness.db, sessionId, "style-fields", "k", fields);
    await run("style-extract", [respondingWith(someExemplars(passageId))]);
  };

  test("it builds a card, binds the session to it, and cites the passage", async () => {
    await seedCorpus();
    const passageId = await seedPassage();
    await bothPasses(passageId);

    const session = await requireSession(harness.db, sessionId);
    expect(session.cardId).not.toBeNull();
    const stored = await findCard(harness.db, session.cardId ?? "");
    expect(stored?.card.voice.pov.value).toBe("third person limited");
    // Invariant 2: every derived claim carries the passage it was read from.
    expect(stored?.card.voice.pov.citation?.passageId).toBe(passageId);
    // And a corpus claim carries none, which is the other half of 0030.
    expect(stored?.card.antiPatterns.citation).toBeUndefined();
    expect(stored?.card.antiPatterns.origin).toBe("measured");
  });

  test("the second pass refuses when the first has not run", async () => {
    // The stages are joined by the queue, not by a call, so `style-extract`
    // finding no readings is an ordinary state and must name it rather than
    // extract from nothing.
    await seedCorpus();
    await seedPassage();
    const block = prosodyBlockSchema.parse(await run("prosody-compute", []));
    await recordStageKey(harness.db, sessionId, "prosody-compute", "k", block);
    await expect(
      run("style-extract", [respondingWith({ exemplars: [] })]),
    ).rejects.toThrow(/readings have not been taken/i);
  });

  test("without a measured corpus the first pass refuses", async () => {
    await expect(
      run("style-fields", [respondingWith({ fields: [] })]),
    ).rejects.toThrow(/not been measured/i);
  });

  test("readings that are not the declared shape are a schema_violation", async () => {
    // Invariant 4: a model's output is parsed, never trusted.
    await seedCorpus();
    await seedPassage();
    const block = prosodyBlockSchema.parse(await run("prosody-compute", []));
    await recordStageKey(harness.db, sessionId, "prosody-compute", "k", block);

    await expect(
      run("style-fields", [respondingWith({ fields: "not an array" })]),
    ).rejects.toMatchObject({ code: "schema_violation" });
  });

  test("text that is not JSON is a schema_violation, not a crash", async () => {
    await seedCorpus();
    await seedPassage();
    const block = prosodyBlockSchema.parse(await run("prosody-compute", []));
    await recordStageKey(harness.db, sessionId, "prosody-compute", "k", block);

    await expect(
      run("style-fields", [{ deltas: ["I'm afraid I can't do that."] }]),
    ).rejects.toMatchObject({ code: "schema_violation" });
  });
});

describe("the stages that need a card say so", () => {
  test("outline without a card is invalid_input, not a null dereference", async () => {
    await expect(
      run("outline", [respondingWith({ beats: [], title: "x" })]),
    ).rejects.toThrow(/style card/i);
  });

  test("the story without an outline is invalid_input", async () => {
    await expect(run("story", [{ deltas: ["prose"] }])).rejects.toThrow(
      /no outline/i,
    );
  });

  test("style-fit on a session with neither card nor story names the card first", async () => {
    // The card is read before the story, so that is the failure a session with
    // neither gets. Naming which one is missing is the point; which comes first
    // is arbitrary and this pins it so a reorder is a visible change.
    await expect(run("style-fit", [])).rejects.toThrow(/style card/i);
  });
});

describe("an unimplemented stage id", () => {
  test("is refused by name rather than silently succeeding", async () => {
    await expect(run("transmogrify", [])).rejects.toBeInstanceOf(AuteurError);
  });
});

describe("the scripted models are the ones the provider offers", () => {
  test("a typed stage would resolve to a structured-output model", async () => {
    // Guards the fixture rather than the code: a scripted catalogue without a
    // structured-output model would make every typed-stage test vacuous.
    expect(SCRIPTED_MODELS.some((model) => model.structuredOutput)).toBe(true);
  });
});
