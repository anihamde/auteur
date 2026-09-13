-- 0008_revision_notes
--
-- Expand before contract (docs/ARCHITECTURE.md §3.3). A deploy replaces
-- functions while earlier invocations are still finishing, so this file may
-- add a nullable column, an index or a constraint — and the migration that
-- drops or renames what it replaces is a later file, after the code that
-- read the old shape has stopped running. `scripts/check-migrations.ts`
-- fails a file that does both.
--
-- Never edit this file once it has been applied anywhere: the checksum is
-- verified on every boot and a mismatch aborts. Roll forward instead.

-- What the reader said about a stage's output, in their own words.
--
-- The pipeline's only other input from a person is an answer to a question it
-- asked, and a question is a closed thing: the model wrote it, the reader chose
-- among suggestions, and the answer means what the question meant. A note is
-- the opposite — it is about the beat sheet or the prose that exists, and
-- nothing anticipated it.
--
-- Rows accumulate and are never edited. A reader who asks for a shorter middle
-- and then for a longer one has said two things, and the second does not erase
-- the first: the stage reads them in order, which is what makes "and also" work
-- without a round counter. It is also what §7.5 hashes — the note set is a
-- direct input of the stage it is about, so adding one restales that stage and
-- everything downstream, with no invalidation rule written anywhere.
CREATE TABLE IF NOT EXISTS revision_notes (
  id         uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  -- The stage the note is about, not the stage that reads it. They are the
  -- same today and a note on the outline that only the prose stage read would
  -- be a note the outline could never act on.
  stage_id   text NOT NULL,
  -- Non-empty after trimming: an empty note restales the stage and tells it
  -- nothing, which costs a model call to produce the same output again.
  note       text NOT NULL CHECK (length(btrim(note)) >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The read is always "this session's notes on this stage, oldest first", and
-- the write is an insert. One index covers both.
CREATE INDEX IF NOT EXISTS revision_notes_by_stage
  ON revision_notes (session_id, stage_id, created_at);
