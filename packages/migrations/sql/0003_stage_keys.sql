-- 0003_stage_keys
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

-- One row per stage that has completed, holding the input key it completed
-- with. §7.5 makes staleness a comparison rather than a flag, and the
-- comparison needs somewhere to read the previous key from.
--
-- `artifacts.input_key` already does this for the four kinds that produce a
-- document. It cannot do it for the other six stages: `corpus-select`,
-- `work-fetch`, `prosody-compute`, `style-extract`, `clarify` and `critique`
-- write to `works`, `passages`, `style_cards` and `questions`, none of which
-- is session-scoped in the way a key needs to be. Without this table those
-- six stages have no previous key, so every one of them is either always
-- stale or never stale — and "always stale" means re-entering a step
-- re-downloads a corpus, which is exactly what §7.5 exists to prevent.
CREATE TABLE stage_keys (
  session_id   uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  stage_id     text NOT NULL,
  input_key    text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, stage_id)
);
