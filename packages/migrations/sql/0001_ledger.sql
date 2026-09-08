-- The ledger. Every later migration records itself here, inside its own
-- transaction, so a migration that throws mid-way leaves no row and no partial
-- schema and the next run retries it.
CREATE TABLE IF NOT EXISTS _auteur_migrations (
  version    integer PRIMARY KEY,
  name       text NOT NULL,
  checksum   text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
