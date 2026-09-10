-- 0006_catalogue_works
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

-- Every book the catalogue names, so search never leaves this database.
--
-- The index this product searched lived behind a bot challenge that a
-- datacenter address cannot pass: `gutendex.com` answers 403 with Cloudflare's
-- "Just a moment…" interstitial to every request from the deployment, while
-- `gutenberg.org` — where the text itself lives — answers 200 in 246ms
-- (decision 0023). So the catalogue comes here once and is read from here
-- after: the corpus index becomes evidence this system holds, which is what
-- the rest of the product already claims about everything else it measures.
--
-- Separate from `works`, which holds *fetched and cleaned* text and requires
-- it. A catalogue row is a book that exists; a `works` row is a book this
-- system has read. Folding them together would mean a nullable `text` on the
-- table whose whole point is that the text is there.
--
-- `authors` is not separate: the catalogue populates it directly. A row there
-- has always meant "an author this system knows about", and `measured_words`
-- staying null is exactly how it already says "not yet measured".
CREATE TABLE IF NOT EXISTS catalogue_works (
  -- `gutenberg:1234`, the same provider-prefixed shape author ids use.
  id           text PRIMARY KEY,
  author_id    text NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  title        text NOT NULL,
  language     text NOT NULL,
  -- Derived from the id rather than stored by the catalogue, which does not
  -- carry one. Stored anyway: the derivation is the catalogue's convention,
  -- not ours, and a row that names its own source can outlive a change to it.
  source_url   text NOT NULL,
  imported_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalogue_works_author_idx
  ON catalogue_works (author_id);

-- Search is `display_name ILIKE '%query%'`, which cannot use a b-tree. Trigrams
-- can, and the extension ships with the server this deploys on.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS authors_display_name_trgm_idx
  ON authors USING gin (display_name gin_trgm_ops);
