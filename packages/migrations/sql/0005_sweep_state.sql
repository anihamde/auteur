-- 0005_sweep_state
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

-- When the sweep last ran, so traffic can drive it.
--
-- The platform's scheduler is not always available at the frequency the sweep
-- needs — a Hobby project gets one cron firing a day, and a stalled story would
-- then resume tomorrow. So any request may run the sweep, and this row is what
-- stops every request from running it: the throttle is a conditional UPDATE,
-- the same shape `stage_queue` uses to claim a row, because function instances
-- are plural and a timestamp held in memory would be one per instance.
--
-- One row, forced by a primary key that can only hold `true`. A table that is
-- supposed to have a single row and does not say so grows a second one on the
-- day two instances insert at once.
CREATE TABLE IF NOT EXISTS sweep_state (
  only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),
  last_swept_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sweep_state (only_row) VALUES (true) ON CONFLICT DO NOTHING;
