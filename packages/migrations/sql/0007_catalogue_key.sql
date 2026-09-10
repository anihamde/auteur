-- 0007_catalogue_key
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

-- A book credited to two people is two rows, not one row that loses a credit.
--
-- 0006 made the gutenberg work id the primary key, which reads as obvious and
-- is wrong: `The Party and Other Stories` is credited to Chekhov and to
-- Constance Garnett, so folding it under both authors produces two rows with
-- the same id. The import failed on the first batch containing one —
-- "ON CONFLICT DO UPDATE command cannot affect row a second time" — which is
-- Postgres declining to guess which of the two duplicates wins.
--
-- The table answers one question: which works belong to this author. So the
-- key is the pair, and a translator's corpus and an author's corpus can both
-- contain the same book, which is true of them.
ALTER TABLE catalogue_works DROP CONSTRAINT catalogue_works_pkey;
ALTER TABLE catalogue_works ADD PRIMARY KEY (author_id, id);
