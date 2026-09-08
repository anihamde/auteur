-- The schema of docs/ARCHITECTURE.md §3.2.
--
-- Conventions, from §3.1: UUIDv7 primary keys minted in TypeScript so an id
-- exists before its insert; `text` + CHECK rather than an enum type, because a
-- CHECK mirrors onto a TypeScript union and is altered by a migration;
-- timestamptz always, never a bare timestamp; jsonb for documents that are read
-- whole and written whole and never queried into.

CREATE TABLE authors (
  id             text PRIMARY KEY,
  provider       text NOT NULL CHECK (provider IN ('gutenberg')),
  kind           text NOT NULL CHECK (kind IN ('full-text', 'secondary')),
  display_name   text NOT NULL,
  birth_year     integer,
  death_year     integer,
  work_count     integer NOT NULL,
  measured_words integer,
  fetched_at     timestamptz
);

CREATE TABLE style_cards (
  id         uuid PRIMARY KEY,
  author_id  text NOT NULL REFERENCES authors(id),
  version    integer NOT NULL,
  build_key  text NOT NULL,
  provenance text NOT NULL CHECK (provenance IN ('full-text', 'secondary')),
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  card       jsonb NOT NULL,
  built_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (author_id, version),
  -- Rebuilding with identical inputs is a cache hit, not a version 4. §4.4.
  UNIQUE (build_key)
);

CREATE TABLE sessions (
  id            uuid PRIMARY KEY,
  step          text NOT NULL CHECK (step IN
                  ('idea','author','research','clarify','outline','draft','result')),
  idea          text NOT NULL,
  constraints   text,
  length_preset text NOT NULL CHECK (length_preset IN
                  ('flash','short','long','novelette')),
  author_id     text REFERENCES authors(id),
  card_id       uuid REFERENCES style_cards(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE card_overlays (
  session_id uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  card_id    uuid NOT NULL REFERENCES style_cards(id),
  fields     jsonb NOT NULL
);

CREATE TABLE stage_pins (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  stage_id   text NOT NULL,
  model_id   text NOT NULL,
  PRIMARY KEY (session_id, stage_id)
);

CREATE TABLE works (
  id              text PRIMARY KEY,
  author_id       text NOT NULL REFERENCES authors(id),
  title           text NOT NULL,
  year            integer,
  language        text NOT NULL,
  translator      text,
  source_url      text NOT NULL,
  cleaner_version text NOT NULL,
  word_count      integer NOT NULL,
  text            text NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  -- The cache key. Re-cleaning requires re-fetching; re-segmenting does not.
  UNIQUE (source_url, cleaner_version)
);

CREATE TABLE passages (
  id         uuid PRIMARY KEY,
  work_id    text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  char_start integer NOT NULL,
  char_end   integer NOT NULL,
  text       text NOT NULL,
  CHECK (char_end > char_start)
);

CREATE TABLE questions (
  id           uuid PRIMARY KEY,
  session_id   uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round        integer NOT NULL CHECK (round BETWEEN 1 AND 3),
  ordinal      integer NOT NULL,
  text         text NOT NULL,
  -- Non-empty: a question that cannot state the decision it resolves is not
  -- asked. §6.5 makes this a parse failure; the CHECK makes it unstorable too.
  decision     text NOT NULL CHECK (length(decision) >= 8),
  why_asked    text NOT NULL CHECK (length(why_asked) >= 16),
  suggestions  jsonb NOT NULL,
  depends_on   jsonb NOT NULL,
  answer       text,
  answer_state text NOT NULL CHECK (answer_state IN
                 ('open','answered','skipped','invalidated')),
  UNIQUE (session_id, round, ordinal)
);

CREATE TABLE artifacts (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN
               ('outline','draft','report','decisions')),
  -- What makes staleness a computed fact rather than a flag. §7.5.
  input_key  text NOT NULL,
  body       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, kind)
);

CREATE TABLE events (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  -- Gap-free per session, from 1. A cursor of 0 means "from the beginning",
  -- so a seq of 0 would collide with it.
  seq        integer NOT NULL CHECK (seq >= 1),
  type       text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, seq)
);

CREATE TABLE stage_runs (
  id                  uuid PRIMARY KEY,
  session_id          uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  stage_id            text NOT NULL,
  attempt             integer NOT NULL,
  model_id            text,
  tier                text CHECK (tier IN ('cheap','balanced','strong')),
  status              text NOT NULL CHECK (status IN
                        ('running','ok','error','cancelled')),
  input_tokens        integer,
  cached_input_tokens integer,
  output_tokens       integer,
  -- Computed at write time from declared prices, so a later price-table edit
  -- does not rewrite the history of what a session cost. §10.2.
  cost_micros         bigint,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  error_code          text
);

CREATE INDEX stage_runs_session_idx ON stage_runs (session_id, started_at);

-- One row per session with a run in flight. The run claim and the cancel flag.
CREATE TABLE session_runs (
  session_id       uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  claimed_by       text NOT NULL,
  status           text NOT NULL CHECK (status IN
                     ('running','done','error','cancelled')),
  cancel_requested boolean NOT NULL DEFAULT false,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz
);

-- The durable stage chain. A stage's last act is to enqueue the next; a cron
-- sweep re-invokes whatever a lost invocation left behind. §5.3.
CREATE TABLE stage_queue (
  id          uuid PRIMARY KEY,
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  stage_id    text NOT NULL,
  status      text NOT NULL CHECK (status IN
                ('queued','claimed','done','error')),
  attempt     integer NOT NULL DEFAULT 0,
  claimed_by  text,
  claimed_at  timestamptz,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, stage_id, attempt)
);

CREATE INDEX stage_queue_sweep_idx ON stage_queue (status, claimed_at);

CREATE TABLE stories (
  session_id uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  title      text,
  markdown   text NOT NULL,
  word_count integer NOT NULL,
  prosody    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
