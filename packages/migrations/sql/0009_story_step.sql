-- 0009_story_step
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

-- The sixth step is `story`, not `draft`.
--
-- A draft is a thing you make before the thing, and there is no longer a stage
-- after it that turns one into the other: `critique` and `revise` are gone, and
-- the reader's note is what a revision now is.
--
-- **Both are admitted, and `draft` is not dropped.** This is the expand half:
-- a function still running the previous deploy will write `draft` for minutes
-- after this lands, and a CHECK that refused it would fail those writes. The
-- contract dropping `draft` is a later migration, after nothing writes it.
ALTER TABLE sessions DROP CONSTRAINT sessions_step_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_step_check CHECK (step IN
  ('idea','author','research','clarify','outline','draft','story','result'));

-- A session left on `draft` by the previous deploy is on `story` now. The two
-- name the same screen, and a reader who reloads must not land on a step the
-- rail no longer has.
UPDATE sessions SET step = 'story' WHERE step = 'draft';
