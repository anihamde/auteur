import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { newId } from "@auteur/ids/new-id";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import {
  findArtifact,
  inputKeyOf,
  putArtifact,
  readFresh,
} from "../../src/artifacts.ts";
import { putPins, readPins } from "../../src/pins.ts";
import {
  answerQuestion,
  answerSetFor,
  invalidateFromRound,
  listQuestions,
  putQuestionRound,
} from "../../src/questions.ts";
import {
  createSession,
  findSession,
  requireSession,
  updateSession,
} from "../../src/sessions.ts";
import { readStageKeys, recordStageKey } from "../../src/stage-keys.ts";

let harness: TestDb;

beforeAll(async () => {
  harness = await createTestDb();
});

afterAll(async () => {
  await harness.close();
});

const aSession = async (): Promise<string> => {
  const session = await createSession(harness.db, {
    id: newId(),
    idea: "a lighthouse keeper who has never seen the sea",
    lengthPreset: "flash",
  });
  return session.id;
};

describe("staleness is computed, never flagged", () => {
  test("an artifact reads back fresh under the key it was written with", async () => {
    const sessionId = await aSession();
    await putArtifact(harness.db, {
      body: { beats: [{ index: 1, text: "the lamp" }], title: "Lamp" },
      inputKey: "key-1",
      kind: "outline",
      sessionId,
    });

    const fresh = await readFresh(harness.db, sessionId, "outline", "key-1");
    expect(fresh?.inputKey).toBe("key-1");
  });

  test("and reads back absent once a dependency's key has changed", async () => {
    // §7.5. The comparison lives in the WHERE clause so a caller cannot read
    // the row, forget to compare, and serve a stale outline. There is no
    // `stale` column and there must not be one: a flag has to be set by
    // whoever invalidates, which is seven `if` statements and one of them
    // wrong.
    const sessionId = await aSession();
    await putArtifact(harness.db, {
      body: { title: "Lamp" },
      inputKey: "key-1",
      kind: "outline",
      sessionId,
    });

    expect(
      await readFresh(harness.db, sessionId, "outline", "key-2"),
    ).toBeUndefined();
    // The row is still there — staleness is not deletion. The report and the
    // export still render what was produced.
    expect(
      (await findArtifact(harness.db, sessionId, "outline"))?.inputKey,
    ).toBe("key-1");
  });

  test("a rewrite replaces the row rather than adding a second", async () => {
    const sessionId = await aSession();
    await putArtifact(harness.db, {
      body: { title: "first" },
      inputKey: "key-1",
      kind: "outline",
      sessionId,
    });
    await putArtifact(harness.db, {
      body: { title: "second" },
      inputKey: "key-2",
      kind: "outline",
      sessionId,
    });
    expect(await inputKeyOf(harness.db, sessionId, "outline")).toBe("key-2");
    expect(
      (await findArtifact<{ title: string }>(harness.db, sessionId, "outline"))
        ?.body.title,
    ).toBe("second");
  });

  test("kinds are independent: restaling the outline does not touch the report", async () => {
    const sessionId = await aSession();
    await putArtifact(harness.db, {
      body: {},
      inputKey: "outline-1",
      kind: "outline",
      sessionId,
    });
    await putArtifact(harness.db, {
      body: {},
      inputKey: "report-1",
      kind: "report",
      sessionId,
    });
    await putArtifact(harness.db, {
      body: {},
      inputKey: "outline-2",
      kind: "outline",
      sessionId,
    });
    expect(
      await readFresh(harness.db, sessionId, "report", "report-1"),
    ).toBeDefined();
  });
});

describe("a patch touches the fields it names and no others", () => {
  test("changing the preset does not clear the card the research stage resolved", async () => {
    // The failure this exists to prevent: a store that took a whole `Session`
    // and wrote every column would let "change the preset" overwrite a card id
    // written a moment earlier by a different request.
    const sessionId = await aSession();
    await harness.db.query(
      `INSERT INTO authors (id, provider, kind, display_name, work_count)
       VALUES ('gutenberg:patch', 'gutenberg', 'full-text', 'B', 3)`,
    );
    const cardId = newId();
    await harness.db.query(
      `INSERT INTO style_cards
         (id, author_id, version, build_key, provenance, confidence, card)
       VALUES ($1, 'gutenberg:patch', 1, 'k', 'full-text', 0.9, '{}'::jsonb)`,
      [cardId],
    );
    await updateSession(harness.db, sessionId, {
      authorId: "gutenberg:patch",
      cardId,
    });

    const after = await updateSession(harness.db, sessionId, {
      lengthPreset: "short",
    });
    expect(after.cardId).toBe(cardId);
    expect(after.authorId).toBe("gutenberg:patch");
    expect(after.lengthPreset).toBe("short");
  });

  test("an explicit null clears the field, unlike an omitted one", async () => {
    const sessionId = await aSession();
    await updateSession(harness.db, sessionId, { constraints: "no dialogue" });
    expect((await findSession(harness.db, sessionId))?.constraints).toBe(
      "no dialogue",
    );

    await updateSession(harness.db, sessionId, { step: "author" });
    expect((await findSession(harness.db, sessionId))?.constraints).toBe(
      "no dialogue",
    );

    await updateSession(harness.db, sessionId, { constraints: null });
    expect((await findSession(harness.db, sessionId))?.constraints).toBeNull();
  });

  test("an empty patch is not an error and does not bump updated_at", async () => {
    const sessionId = await aSession();
    const before = await requireSession(harness.db, sessionId);
    const after = await updateSession(harness.db, sessionId, {});
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  test("patching a session that does not exist is not_found, not a silent no-op", async () => {
    await expect(
      updateSession(harness.db, newId(), { step: "draft" }),
    ).rejects.toThrow("does not exist");
  });
});

describe("questions keep their history", () => {
  const aRound = (sessionId: string, round: 1 | 2 | 3) =>
    [0, 1].map((ordinal) => ({
      answer: null,
      answerState: "open" as const,
      decision: "which frame the story takes",
      dependsOn: [],
      id: newId(),
      ordinal,
      round,
      sessionId,
      suggestions: ["first person", "close third"],
      text: "Whose eyes are we behind?",
      whyAsked: "the idea names no point of view at all",
    }));

  test("an invalidated question keeps its row and its answer", async () => {
    // PRD §6.5: "you answered this, then changed it" has to stay visible, and
    // it cannot if the row is deleted or the answer overwritten.
    const sessionId = await aSession();
    const round = aRound(sessionId, 1);
    await putQuestionRound(harness.db, round);
    const first = round[0];
    if (first === undefined) throw new Error("fixture");
    await answerQuestion(harness.db, first.id, "close third");

    expect(await invalidateFromRound(harness.db, sessionId, 1)).toBe(2);

    const stored = await listQuestions(harness.db, sessionId);
    expect(stored).toHaveLength(2);
    expect(stored[0]?.answer).toBe("close third");
    expect(stored[0]?.answerState).toBe("invalidated");
  });

  test("an invalidated question is not in the answer set, so downstream is not permanently stale", async () => {
    const sessionId = await aSession();
    await putQuestionRound(harness.db, aRound(sessionId, 1));
    const round2 = aRound(sessionId, 2);
    await putQuestionRound(harness.db, round2);
    const kept = round2[0];
    if (kept === undefined) throw new Error("fixture");
    await answerQuestion(harness.db, kept.id, "kept");

    await invalidateFromRound(harness.db, sessionId, 1);
    await answerQuestion(harness.db, kept.id, "kept");

    const answers = await answerSetFor(harness.db, sessionId);
    expect(answers).toEqual([]);
  });

  test("a skip is recorded as a state, not as a missing row", async () => {
    // The decisions log distinguishes "you answered" from "model chose —
    // question skipped", and it can only do that if the skip was recorded.
    const sessionId = await aSession();
    const round = aRound(sessionId, 1);
    await putQuestionRound(harness.db, round);
    const skipped = round[1];
    if (skipped === undefined) throw new Error("fixture");
    await answerQuestion(harness.db, skipped.id, null);

    const stored = await listQuestions(harness.db, sessionId);
    expect(stored[1]?.answerState).toBe("skipped");
    expect(await answerSetFor(harness.db, sessionId)).toHaveLength(1);
  });

  test("re-writing a round is idempotent, so a retried stage does not duplicate it", async () => {
    const sessionId = await aSession();
    const round = aRound(sessionId, 1);
    await putQuestionRound(harness.db, round);
    await putQuestionRound(harness.db, round);
    expect(await listQuestions(harness.db, sessionId)).toHaveLength(2);
  });

  test("an empty round writes nothing rather than failing on an empty statement", async () => {
    await putQuestionRound(harness.db, []);
  });
});

describe("pins are replaced, never merged", () => {
  test("writing a smaller set removes the pins it omits", async () => {
    // "Unpin this stage" is a write of the remaining pins, not a second
    // endpoint. A merging write would make an unpin impossible to express.
    const session = await createSession(harness.db, {
      id: newId(),
      idea: "a lighthouse keeper",
      lengthPreset: "flash",
    });
    await putPins(
      harness.db,
      session.id,
      new Map([
        ["draft", "claude-sonnet-4.5"],
        ["outline", "gpt-5"],
      ]),
    );
    await putPins(harness.db, session.id, new Map([["draft", "gpt-5"]]));

    const pins = await readPins(harness.db, session.id);
    expect(pins.get("draft")).toBe("gpt-5");
    expect(pins.has("outline")).toBe(false);
  });

  test("an empty set clears every pin", async () => {
    const session = await createSession(harness.db, {
      id: newId(),
      idea: "a cartographer",
      lengthPreset: "flash",
    });
    await putPins(harness.db, session.id, new Map([["draft", "gpt-5"]]));
    await putPins(harness.db, session.id, new Map());
    expect((await readPins(harness.db, session.id)).size).toBe(0);
  });
});

describe("a stage key is the previous key, upserted", () => {
  test("recording twice keeps one row and the later key", async () => {
    // Invalidation is a key that no longer matches, never a row somebody has
    // to remember to delete — so there is no `clearStageKey` and this upserts.
    const session = await createSession(harness.db, {
      id: newId(),
      idea: "a lamplighter",
      lengthPreset: "flash",
    });
    await recordStageKey(harness.db, session.id, "outline", "key-one");
    await recordStageKey(harness.db, session.id, "outline", "key-two");

    const keys = await readStageKeys(harness.db, session.id);
    expect(keys.size).toBe(1);
    expect(keys.get("outline")).toBe("key-two");
  });

  test("a stage that never completed has no row, rather than a sentinel", async () => {
    // Stale by absence. A sentinel is a value some stage could one day produce.
    const session = await createSession(harness.db, {
      id: newId(),
      idea: "a bell-ringer",
      lengthPreset: "flash",
    });
    expect((await readStageKeys(harness.db, session.id)).has("draft")).toBe(
      false,
    );
  });
});
