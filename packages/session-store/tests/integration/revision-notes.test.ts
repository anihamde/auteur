import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { NOTE_LONGEST } from "@auteur/core/session";
import { newId } from "@auteur/ids/new-id";
import { createTestDb, type TestDb } from "@auteur/test-db/test-db";
import {
  addRevisionNote,
  listRevisionNotes,
  revisionNotesFor,
} from "../../src/revision-notes.ts";
import { createSession } from "../../src/sessions.ts";

/**
 * What the reader said, kept in the order they said it.
 *
 * The order is the behaviour. A note that replaced the one before it would
 * make "shorter in the middle" and "and give the ending more room" into one
 * instruction that drops half of what was asked for, and the stage reading
 * them has no way to notice.
 */

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

const note = (sessionId: string, stageId: "outline" | "draft", text: string) =>
  addRevisionNote(harness.db, { id: newId(), note: text, sessionId, stageId });

describe("notes accumulate rather than replace", () => {
  test("both are read back, oldest first", async () => {
    const sessionId = await aSession();
    await note(sessionId, "outline", "shorter in the middle");
    await note(sessionId, "outline", "and give the ending more room");

    expect(
      (await listRevisionNotes(harness.db, sessionId, "outline")).map(
        (entry) => entry.note,
      ),
    ).toEqual(["shorter in the middle", "and give the ending more room"]);
  });

  test("two written in the same millisecond still have an order", async () => {
    // `created_at` defaults to `now()`, which is the transaction's clock and
    // is identical for two inserts a microsecond apart. Ordering by it alone
    // leaves the pair free to swap between reads, so the stage's prompt would
    // change without any note changing — and §7.5 would not restale it,
    // because the note set is the same set.
    const sessionId = await aSession();
    const written = await Promise.all([
      note(sessionId, "outline", "first"),
      note(sessionId, "outline", "second"),
      note(sessionId, "outline", "third"),
    ]);
    const ids = new Set(written.map((entry) => entry.id));

    const reads = await Promise.all([
      listRevisionNotes(harness.db, sessionId, "outline"),
      listRevisionNotes(harness.db, sessionId, "outline"),
    ]);
    expect(reads[0]?.map((entry) => entry.id)).toEqual(
      reads[1]?.map((entry) => entry.id) ?? [],
    );
    expect(new Set(reads[0]?.map((entry) => entry.id))).toEqual(ids);
  });
});

describe("a note belongs to one stage of one session", () => {
  test("the outline's notes are not the draft's", async () => {
    const sessionId = await aSession();
    await note(sessionId, "outline", "shorter in the middle");
    await note(sessionId, "draft", "the dialogue is too clean");

    expect(
      await listRevisionNotes(harness.db, sessionId, "draft"),
    ).toHaveLength(1);
    const grouped = await revisionNotesFor(harness.db, sessionId);
    expect([...grouped.keys()].toSorted()).toEqual(["draft", "outline"]);
    expect(grouped.get("outline")?.map((entry) => entry.note)).toEqual([
      "shorter in the middle",
    ]);
  });

  test("another session's notes do not travel", async () => {
    const mine = await aSession();
    const theirs = await aSession();
    await note(theirs, "outline", "not mine");

    expect(await listRevisionNotes(harness.db, mine, "outline")).toEqual([]);
    expect((await revisionNotesFor(harness.db, mine)).size).toBe(0);
  });

  test("deleting the session takes its notes with it", async () => {
    const sessionId = await aSession();
    await note(sessionId, "outline", "shorter in the middle");
    await harness.db.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);

    expect(await listRevisionNotes(harness.db, sessionId, "outline")).toEqual(
      [],
    );
  });
});

describe("an empty note is not a note", () => {
  test("whitespace alone is refused by the column, not silently stored", async () => {
    // An empty note restales the stage and tells it nothing, which spends a
    // model call to produce the same output again.
    const sessionId = await aSession();
    expect(note(sessionId, "outline", "   ")).rejects.toThrow();
  });

  test("surrounding whitespace is trimmed on the way in", async () => {
    const sessionId = await aSession();
    const written = await note(sessionId, "outline", "  trim me  ");
    expect(written.note).toBe("trim me");
  });

  test("a note at the schema's ceiling is storable", async () => {
    // The ceiling is the contract's, and `text` has no length of its own. A
    // reader who pastes a long paragraph must not get an unexplained 500.
    const sessionId = await aSession();
    const written = await note(sessionId, "outline", "x".repeat(NOTE_LONGEST));
    expect(written.note).toHaveLength(NOTE_LONGEST);
  });
});
