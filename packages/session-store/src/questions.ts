import type { AnswerState, Question } from "@auteur/core/session";
import type { Db } from "@auteur/db/db";
import { columns } from "@auteur/db/sql";

/**
 * Clarifying questions, their answers, and their invalidation.
 *
 * An invalidated question keeps its row. `PRD.md` §6.5: "you answered this,
 * then changed it" has to stay visible, and it cannot if the row is deleted or
 * the answer overwritten in place. So `invalidated` is a fourth state, not the
 * absence of one.
 */

type Row = {
  id: string;
  session_id: string;
  round: number;
  ordinal: number;
  text: string;
  decision: string;
  why_asked: string;
  suggestions: string[];
  depends_on: string[];
  answer: string | null;
  answer_state: AnswerState;
};

const COLUMNS = [
  "id",
  "session_id",
  "round",
  "ordinal",
  "text",
  "decision",
  "why_asked",
  "suggestions",
  "depends_on",
  "answer",
  "answer_state",
];

const toQuestion = (row: Row): Question => ({
  answer: row["answer"],
  answerState: row["answer_state"],
  decision: row["decision"],
  dependsOn: row["depends_on"],
  id: row["id"],
  ordinal: row["ordinal"],
  round: row["round"],
  sessionId: row["session_id"],
  suggestions: row["suggestions"],
  text: row["text"],
  whyAsked: row["why_asked"],
});

/**
 * Write a whole round at once.
 *
 * A round is produced by one model call and is meaningless half-stored, so the
 * batch is one statement: either the round is there or it is not, and a
 * reconnect mid-write cannot show the user two of four questions.
 */
export const putQuestionRound = async (
  db: Db,
  questions: readonly Question[],
): Promise<void> => {
  if (questions.length === 0) return;
  await db.query(
    `INSERT INTO questions (${columns(COLUMNS)})
     SELECT * FROM unnest(
       $1::uuid[], $2::uuid[], $3::int[], $4::int[], $5::text[], $6::text[],
       $7::text[], $8::jsonb[], $9::jsonb[], $10::text[], $11::text[])
     ON CONFLICT (session_id, round, ordinal) DO NOTHING`,
    [
      questions.map((question) => question.id),
      questions.map((question) => question.sessionId),
      questions.map((question) => question.round),
      questions.map((question) => question.ordinal),
      questions.map((question) => question.text),
      questions.map((question) => question.decision),
      questions.map((question) => question.whyAsked),
      questions.map((question) => JSON.stringify(question.suggestions)),
      questions.map((question) => JSON.stringify(question.dependsOn)),
      questions.map((question) => question.answer),
      questions.map((question) => question.answerState),
    ],
  );
};

export const listQuestions = async (
  db: Db,
  sessionId: string,
): Promise<Question[]> => {
  const result = await db.query<Row>(
    `SELECT ${columns(COLUMNS)} FROM questions WHERE session_id = $1
     ORDER BY round, ordinal`,
    [sessionId],
  );
  return result.rows.map(toQuestion);
};

/**
 * Record an answer, or a skip.
 *
 * A skip is an answer state, not a missing row: the decisions log distinguishes
 * "you answered" from "model chose — question skipped", and it can only do that
 * if the skip was recorded.
 */
export const answerQuestion = async (
  db: Db,
  id: string,
  answer: string | null,
): Promise<boolean> => {
  const result = await db.query(
    `UPDATE questions
        SET answer = $2, answer_state = CASE WHEN $2::text IS NULL
                                             THEN 'skipped' ELSE 'answered' END
      WHERE id = $1 AND answer_state IN ('open', 'answered', 'skipped')`,
    [id, answer],
  );
  return (result.rowCount ?? 0) === 1;
};

/**
 * Invalidate every question of a round the user has gone back behind.
 *
 * Returns the count, because the caller emits one decisions-log entry per
 * invalidated question and needs to know there were any.
 */
export const invalidateFromRound = async (
  db: Db,
  sessionId: string,
  fromRound: number,
): Promise<number> => {
  const result = await db.query(
    `UPDATE questions SET answer_state = 'invalidated'
      WHERE session_id = $1 AND round >= $2 AND answer_state <> 'invalidated'`,
    [sessionId, fromRound],
  );
  return result.rowCount ?? 0;
};

/**
 * The answer set, as the input key sees it.
 *
 * Invalidated questions are excluded: they are kept for the log, but they are
 * not inputs any more, and including them would leave every downstream stage
 * permanently stale after a single revision.
 */
export const answerSetFor = async (
  db: Db,
  sessionId: string,
): Promise<{ readonly id: string; readonly answer: string | null }[]> => {
  const result = await db.query<{ id: string; answer: string | null }>(
    `SELECT id, answer FROM questions
      WHERE session_id = $1 AND answer_state IN ('answered', 'skipped')
      ORDER BY round, ordinal`,
    [sessionId],
  );
  return result.rows.map((row) => ({ answer: row["answer"], id: row["id"] }));
};

/**
 * Invalidate every transitive descendant of one question, keeping the rows.
 *
 * §6.5's tree, in one recursive statement. Recursive rather than a loop in
 * TypeScript because the walk and the write must see the same snapshot: a loop
 * that reads a level, writes it, and reads the next can be interleaved with a
 * concurrent answer and stop halfway down a branch.
 *
 * The rows are kept and marked, never deleted. "You answered this, then
 * changed it" stays visible in the log, which is the point of the state
 * existing at all — a deleted row would make the history a lie by omission.
 *
 * The question itself is **not** invalidated: it was edited, not withdrawn.
 * Returns the ids that were, because the caller writes one decisions-log entry
 * per invalidated question.
 */
export const invalidateDescendants = async (
  db: Db,
  sessionId: string,
  questionId: string,
): Promise<string[]> => {
  const result = await db.query<{ id: string }>(
    `WITH RECURSIVE descendants AS (
       SELECT id FROM questions
        WHERE session_id = $1 AND depends_on @> to_jsonb($2::text)
       UNION
       SELECT q.id FROM questions q
         JOIN descendants d
           ON q.depends_on @> to_jsonb(d.id::text)
        WHERE q.session_id = $1
     )
     UPDATE questions SET answer_state = 'invalidated'
      WHERE id IN (SELECT id FROM descendants)
        AND answer_state <> 'invalidated'
      RETURNING id`,
    [sessionId, questionId],
  );
  return result.rows.map((row) => row["id"]);
};
