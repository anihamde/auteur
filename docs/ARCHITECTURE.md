# auteur — Technical Architecture

Status: draft for review. This is the design as written before implementation.
It resolves the three `[open]` items in `PRD.md` that are architectural, and it
corrects `PRD.md` §12 in one substantial way — the packages worth taking are
nexus's, not argo-browser's, and one of them is the Ramp Router adapter the PRD
plans to write.

Sources, in precedence order for anything this document does not say:

1. `docs/PRD.md` — product requirements, draft v0.1.
2. `docs/design/wizard-handoff/README.md` — wins on screen layout, behaviour and copy.
3. `docs/design/design-system/readme.md` — wins on tokens, component props, content rules.

Where those three disagree with each other, §13 says what is built and why.

Stack: Bun + Turborepo + Biome · TypeScript · Postgres on Neon, hand-written
SQL, no ORM · Vite + React + PandaCSS on Vercel with eleven routes as functions
· Hono + SSE on one Fly machine for the pipeline · Ramp Router as the model
gateway behind a provider seam. Single-user, no accounts; deployed rather than
local (§7).

---

## 0. The four invariants

Everything below exists to hold four statements. When a design decision is
unclear, resolve it toward these.

1. **A measurement is never an opinion.** The `prosody` block is computed from
   full text with no model anywhere in the path, and nothing may overwrite it.
   What a draft aims at is a different field.
2. **Every claim carries its provenance.** Every style-card field is
   `measured`, `derived` (with the passage it was read from) or `edited`. The
   style-fit report scores against the measurement and against the target
   separately, and never presents a user-invented number as the author's.
3. **The wizard never blocks and every step is re-enterable.** A skipped
   question is a recorded decision, not a silent one. Re-entering a step
   invalidates what depended on it and keeps what did not.
4. **A model's output is parsed, never trusted.** Every stage output crosses a
   zod schema. A stage that cannot produce its schema fails as that stage
   rather than producing a plausible object three stages downstream.

Invariant 1 is the product. Invariant 2 is what makes it honest. Invariant 3 is
what makes it a wizard rather than an interview. Invariant 4 is what stops a
seven-stage pipeline from being undebuggable.

---

## 1. Monorepo layout

```
apps/
  auteur-web/             Vite + React client and eleven routes, on Vercel
  auteur-runner/          Hono: the pipeline, SSE and cancel, on Fly
packages/
  foundation:  ids  core  errors  env  logger  text  prosody
               tokens  icons  copy  formatting
  infra:       db  migrations
  store:       session-store  card-store  corpus-store  event-store
  service:     corpus-gutenberg  style-card  style-fit  export
  agent:       model-provider  provider-router  prompt  pipeline
  api:         api-contract  api-client  stream-client
  ui:          component-library
  test:        test-support  provenance-suite
  tooling:     tsconfig  biome-config
```

Dependency direction is strictly downward, in the layer order above. A package
imports its own layer or below, never above, and never in a cycle.
`component-library` may import only `tokens`, `icons`, `copy`, `formatting` and
`core`, so it stays openable in a browser with no server behind it. The gate is
`scripts/check-dependencies.ts`, taken from nexus (§2).

Two packages are foundation-layer that a reader might expect elsewhere:

- **`text`** — sentence, word and paragraph segmentation, and the Project
  Gutenberg cleaner. Pure, zero dependencies, versioned (§4.2). It is
  foundation because the corpus builder, the style-fit report and the live
  drift meter must all measure with the identical function; a shared
  implementation is the only thing that makes their numbers comparable.
- **`prosody`** — the deterministic metrics over `text`'s output. Same reason.
  No I/O, no model, no clock.

### Package responsibilities

| Package | Responsibility |
|---|---|
| `ids` | UUIDv7 ids and the branded id types |
| `core` | Domain types and their zod schemas. Zero I/O |
| `errors` | The error taxonomy and its one HTTP mapping |
| `env` | Parse-and-fail-fast environment access |
| `logger` | Structured JSON logging, one line per record |
| `text` | Segmentation and Gutenberg cleaning. Pure, versioned |
| `prosody` | The deterministic metrics. Pure, versioned |
| `tokens` | The design system as a Panda preset |
| `icons` | The Lucide binding, and the only way to draw an icon |
| `copy` | Every user-facing string, with the content rules asserted by test |
| `formatting` | Presentation rules: elapsed times, counts, money, prosody numbers |
| `db` | `pg` connection handling, pooled and direct, and SQL primitives. Knows no domain |
| `migrations` | The ordered SQL ledger and the runner that applies it on access |
| `session-store` | Sessions, answers, artifacts and their staleness |
| `card-store` | The style-card cache, versioned per author |
| `corpus-store` | The `works` and `passages` cache, keyed by source and cleaner version |
| `event-store` | The durable per-session event log the SSE stream replays from |
| `corpus-gutenberg` | gutendex client, text fetch, work and passage selection |
| `style-card` | Compose measured + derived + overlay; version; confidence |
| `style-fit` | Bands, verdicts, and the deterministic half of the report |
| `export` | Markdown export, and the label no export can omit |
| `model-provider` | The provider-neutral model contract and the registry |
| `provider-router` | The Ramp Router adapter |
| `prompt` | Every prompt, assembled purely. No I/O, snapshot-tested |
| `pipeline` | Stage graph, tier resolution, streaming, usage accounting |
| `api-contract` | One zod source of truth for every route |
| `api-client` | The typed fetch client, derived from the contract |
| `stream-client` | The browser half of the SSE stream: cursor, replay, reconnect |
| `component-library` | The 15 design-system primitives |
| `test-support` | happy-dom preload, a styled `render`, the axe audit, the provider conformance suite |
| `provenance-suite` | CI gate: invariant 2, as a build gate rather than a habit |

---

## 2. What is taken, and from where

`PRD.md` §12 plans to take five things from argo-browser. Since it was written,
nexus turns out to hold better versions of four of them, including one the PRD
plans to write from scratch. The corrections are the reason this section is
long.

### The correction that matters: `provider-router` already exists

`PRD.md` §12 proposes adapting argo's `packages/model-client-openai` into a new
`model-client-router`: the Responses API, a `baseURL` pointed at Ramp, plus
structured output. `nexus/packages/provider-router` **is** that package. It is
the Ramp Router adapter, built on `openai` pointed at
`https://api.router.com/v1`, speaking the Responses API statelessly with
`store: false`, with the whole published catalogue as a constant, per-model
thinking levels, a recorded-SSE fixture suite that never touches the network,
and a `scripts/check-router-catalogue.ts` that holds the constant against
`GET /v1/models`.

So auteur takes `provider-router` and `model-provider` — the contract it
implements — and takes argo's `ModelClient` contract not at all. Two
consequences:

- `provider-router` lands close to unmodified, which it would not if auteur
  invented its own contract for it to implement.
- The extensions auteur needs (§6.4) are additive: structured output, three
  fields on `ModelDescriptor`, and a pricing table. Nothing in the adapter's
  streaming, error mapping or request assembly changes.

### Disposition table

`verbatim` means copied and then only renamed. `adapted` means real changes,
named here. `pattern` means the approach is copied and the code is not.

| Taken | From | Disposition |
|---|---|---|
| `model-provider` | nexus | **adapted.** Drop `ServerToolName` / `WebSource` (no web tools in v1) and the `ProviderPayload` reasoning carry-back. Add `maxOutputTokens`, `structuredOutput` and `pricing` to `ModelDescriptor` (§6.4). Add `text.format` to `ModelRequest`. |
| `provider-router` | nexus | **adapted.** Add structured output to `responses-request.ts`; extend `models.ts` rows with the three new fields. Everything else — `responses-stream.ts`, `provider-errors.ts`, the fixtures, the conformance test — verbatim. |
| `errors` | nexus | **adapted.** Same shape, auteur's taxonomy (§7.4). The HTTP-status security reasoning is nexus's and does not apply: auteur is single-user. |
| `env` | nexus | **adapted.** One runtime, so one schema; keep the deferred-then-memoized parse and the `.env.example`-mirrors-the-schema test. |
| `logger` | nexus | **verbatim.** The key-based secret redaction is worth having unchanged. |
| `ids` | nexus | **verbatim.** UUIDv7 plus the branded ids. |
| `chunking` | nexus | **adapted into `text`.** Its cut ladder — structure, then blocks, then sentences, then a boundary that never tears a surrogate pair — is what passage extraction needs. The heading tier is unreachable on plain prose and is dropped. |
| `tokens` | nexus | **pattern.** The preset is generated from auteur's own token CSS; the test-re-reads-the-CSS gate is the thing being copied (§8.1). |
| `icons` | nexus | **adapted.** Same closed-set, locked-stroke wrapper; auteur's sizes are 14/16/20 and its set is the ten glyphs the design uses. |
| `copy` | nexus | **pattern.** New content; auteur's content rules are stricter and are what the tests assert (§8.4). |
| `formatting` | nexus | **adapted.** Keep `relativeTime`, `pluralize`, `metaRow`; add the prosody and money formatters (§8.5). |
| `test-support` | nexus | **verbatim,** minus the archive writers. The happy-dom preload ordering and the styled `render` are both non-obvious and both required. |
| `api-contract` / `api-client` | nexus | **pattern.** One zod object, routes enumerated from it, client generated from it — so a contract change breaks both sides' compile at once. auteur has 14 routes rather than 31. |
| `stream-client` | nexus `loop-client` | **adapted.** The cursor / replay / de-duplicate contract verbatim; the events are auteur's. |
| `run-store` | nexus | **pattern into `event-store`.** Append to the table, then fan out — never the reverse — and a gap-free per-session `seq` (§7.3). |
| `deployment` topology | nexus | **pattern.** Vercel for the routes, Fly for the long-running process, one signed internal dispatch between them, Postgres shared. §7. |
| `migrations` | nexus | **verbatim in approach and close to it in code.** The inlined-manifest-plus-checksum ledger applied by `ensureSchema()` on access under `pg_advisory_lock`, with nobody running a migration by hand. §3.3. |
| `db` | nexus | **adapted.** `pg` primitives verbatim; auteur adds the pooled-versus-direct distinction §3.1 needs and drops the scope argument it has no use for. |
| `run-store` heartbeat and sweeper | nexus | **adapted into `event-store` and `session_runs`.** §7.3. Taken because §7's two units reintroduce the failure it exists for. |
| `scripts/` toolchain | nexus | **verbatim.** `packages.manifest.ts`, `check-dependencies.ts`, `api-surface.ts`, `new-package.ts`, `package-tests.ts`, `check-catalog.ts`, `preflight.ts`, `gate-self-test.ts`. |
| `turbo.json`, `biome.json`, `bunfig.toml`, `.github/workflows/ci.yml` | nexus | **adapted.** Concurrency group, `--affected` on pull requests, `--concurrency=100%`, cache restore keyed on the lockfile. |
| `dependency-min-age` | argo-browser | **verbatim,** with `minimumReleaseAge` in `bunfig.toml`. It closes a real hole: Bun grandfathers versions already in the lockfile. |

### Not taken, and why

| Not taken | Reason |
|---|---|
| argo `packages/component-library` | §8.2. The design system that arrived is auteur's own — 15 components, different props, a two-ground colour system argo has no equivalent of. Porting argo's eight and then rewriting each prop union is more work than building from the token files, and it would leave a Phosphor dependency in a Lucide system. |
| argo `agent-loop` | The PRD takes it as a contract only. nexus's `model-provider` is that contract, and taking it instead is what lets `provider-router` land unmodified. |
| argo `model-client-anthropic`, nexus's absent equivalent | The PRD keeps it for a direct-Anthropic fallback. Deferred: a second adapter is a second wire format to keep correct, and the seam is what makes it a later decision rather than a refactor. `provider-router`'s conformance test is what keeps the seam honest with one implementation behind it — see nexus's `DECISIONS.md` on exactly this. |
| argo `transport-ws`, `protocol-loop` | The PRD's call, and it is right. auteur streams one direction. |
| nexus `scope`, `authz`, `auth`, the stores | Single-user. There is no workspace boundary and no membership, so the branded-scope machinery guards nothing. |
| nexus `retrieval`, `web-search`, `blob`, `email`, `extraction`, `memory`, `merge`, `assets` | No retrieval (PRD §4 explicitly), no uploads, no web research in v1. |
| nexus `agent-loop`, `agent-tools`, `loop-client`'s `useRun` | auteur's pipeline is deterministic stages, not a tool loop. `clarify` re-enters itself but it is a bounded `for` loop over a stage, not an agent. |
| nexus `boundary-suite` | Its invariant does not exist here. Its *idea* does: `provenance-suite` is the analogue (§11.2). |

---

## 3. Persistence

**`[open]` in `PRD.md` §12 — resolved: Postgres on Neon.** An earlier draft of
this section resolved it to `bun:sqlite`, on the reasoning that a single-user
local app should not operate a database. That reasoning was right for a local
app and is void for a deployed one: §7's topology puts the short routes on
Vercel functions, and a function's filesystem is ephemeral and per-invocation,
so a file-backed database is not reachable from them at all. Neon is the
transactional store; nothing else is a system of record.

Three things this buys back, each of which was a cost in the SQLite draft:

- **nexus's `db` and `migrations` come across close to verbatim** rather than
  being rewritten for a second driver (§2). The advisory-lock migration runner,
  the connection handling and the query primitives are all `pg`, which is what
  they were written against.
- **The `database` and `migrations` guidelines apply unmodified.** They are
  written for exactly this — Postgres on Neon, hand-written SQL, no ORM, the
  server converging the schema on access.
- **Serverless connection discipline is a solved problem here**, where under
  SQLite it was an unsolvable one: Vercel functions use Neon's pooled endpoint,
  the Fly runner uses the direct endpoint with its own small pool.

### 3.1 Conventions

- **UUIDv7 primary keys**, minted in TypeScript by `ids`, stored as `uuid`.
  Time-ordered, so rows index and paginate by id and no separate sort column is
  needed. Minted in the application rather than by the database so an id exists
  before the insert, which is what lets an event reference a row it is written
  beside.
- **`text` + `CHECK` instead of an enum type.** A `CHECK` mirrors cleanly onto a
  TypeScript union and is altered by a migration; a Postgres `enum` type is
  altered by a DDL statement with its own transactional rules, for no gain.
- **`timestamptz`**, always UTC, never a bare `timestamp`. `core` converts at
  the boundary; no domain type carries a number where a moment is meant.
- **`jsonb` columns hold documents, not relations.** A style card, an outline
  and a prosody block are each one `jsonb` column, parsed with zod on read
  (invariant 4). They are read whole, written whole, and never queried into.
  Anything that *is* queried — a session's step, an author id, a card version —
  is a real column. `jsonb` rather than `json` so equality and containment work
  if a query ever needs them, at no cost on write.
- **Two connection modes, and the seam between them is `env`.** A Vercel
  function opens against Neon's **pooled** endpoint, because instances are
  plural and short-lived and a direct connection per invocation exhausts the
  server. The Fly runner opens against the **direct** endpoint with a small
  pool it keeps for its lifetime, because it holds transactions across a
  streaming call and pooled-mode PgBouncer does not support that. `env` exposes
  both and each app reads the one it is allowed.
- **One writer per session, not per database.** Postgres has real concurrency,
  so the SQLite draft's "one writer" simplification is gone. What replaces it is
  narrower and is the property that actually matters: a session's stages run in
  exactly one runner process at a time, enforced by `stage_runs` and the
  dispatch lock in §7.3.

### 3.2 Schema

```sql
-- Sessions: one wizard run.
CREATE TABLE sessions (
  id            uuid PRIMARY KEY,
  step          text NOT NULL CHECK (step IN
                  ('idea','author','research','clarify','outline','draft','result')),
  idea          text NOT NULL,              -- verbatim, never rewritten
  constraints   text,                       -- the "hard constraints" field
  length_preset text NOT NULL CHECK (length_preset IN
                  ('flash','short','long','novelette')),
  author_id     text REFERENCES authors(id),
  card_id       uuid REFERENCES style_cards(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Authors, as the corpus index knows them. One row per resolved author,
-- not per search result. The id is provider-scoped and minted, not a uuid:
-- "gutenberg:borges-jorge-luis-1899". §5.2
CREATE TABLE authors (
  id            text PRIMARY KEY,
  provider      text NOT NULL CHECK (provider IN ('gutenberg')),
  kind          text NOT NULL CHECK (kind IN ('full-text','secondary')),
  display_name  text NOT NULL,
  birth_year    integer,
  death_year    integer,
  work_count    integer NOT NULL,
  measured_words integer,                   -- NULL until a corpus is fetched (§5.3)
  fetched_at    timestamptz
);

-- The style-card cache. Canonical, shared across sessions, never edited.
CREATE TABLE style_cards (
  id            uuid PRIMARY KEY,
  author_id     text NOT NULL REFERENCES authors(id),
  version       integer NOT NULL,           -- 1, 2, 3 … per author. "borges@3"
  build_key     text NOT NULL,              -- §4.4. Identity of the inputs
  provenance    text NOT NULL CHECK (provenance IN ('full-text','secondary')),
  confidence    real NOT NULL,              -- citation coverage. §4.5
  card          jsonb NOT NULL,             -- the whole StyleCard
  built_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (author_id, version),
  UNIQUE (build_key)
);

-- Per-session overrides. Never merged into style_cards.
CREATE TABLE card_overlays (
  session_id    uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  card_id       uuid NOT NULL REFERENCES style_cards(id),
  fields        jsonb NOT NULL              -- { [path]: { value, origin } }
);

-- Per-session model pins over the tier defaults. Same layering as the overlay.
CREATE TABLE stage_pins (
  session_id    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  stage_id      text NOT NULL,
  model_id      text NOT NULL,
  PRIMARY KEY (session_id, stage_id)
);

-- Corpus works and the passages selected from them.
CREATE TABLE works (
  id            text PRIMARY KEY,           -- "gutenberg:1234"
  author_id     text NOT NULL REFERENCES authors(id),
  title         text NOT NULL,
  year          integer,
  language      text NOT NULL,
  translator    text,                       -- when gutendex reports one (§5.2)
  source_url    text NOT NULL,
  cleaner_version text NOT NULL,            -- §4.2
  word_count    integer NOT NULL,
  text          text NOT NULL,              -- cleaned full text
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_url, cleaner_version)      -- the cache key. §5.4
);

CREATE TABLE passages (
  id            uuid PRIMARY KEY,
  work_id       text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  char_start    integer NOT NULL,
  char_end      integer NOT NULL,
  text          text NOT NULL               -- verbatim. Exemplars cite this row
);

-- Questions form a tree, not a list (PRD §6).
CREATE TABLE questions (
  id            uuid PRIMARY KEY,
  session_id    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round         integer NOT NULL CHECK (round BETWEEN 1 AND 3),
  ordinal       integer NOT NULL,
  text          text NOT NULL,
  decision      text NOT NULL,              -- what it resolves. Non-empty (§6.5)
  why_asked     text NOT NULL,              -- why the answers so far did not settle it
  suggestions   jsonb NOT NULL,             -- string[]
  depends_on    jsonb NOT NULL,             -- questionId[]
  answer        text,                       -- NULL = unanswered
  answer_state  text NOT NULL CHECK (answer_state IN
                  ('open','answered','skipped','invalidated')),
  UNIQUE (session_id, round, ordinal)
);

-- Stage artifacts: outline, draft, report, and the decisions log.
-- input_key is what makes staleness a computed fact rather than a flag (§7.5).
CREATE TABLE artifacts (
  session_id    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN
                  ('outline','draft','report','decisions')),
  input_key     text NOT NULL,
  body          jsonb NOT NULL,             -- markdown for 'draft' is a JSON string
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, kind)
);

-- The durable event log. §7.3.
CREATE TABLE events (
  session_id    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq           integer NOT NULL,           -- gap-free, per session, from 1
  type          text NOT NULL,
  payload       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, seq)
);

-- One row per provider call. The cost line in the rail footer sums this.
CREATE TABLE stage_runs (
  id            uuid PRIMARY KEY,
  session_id    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  stage_id      text NOT NULL,
  attempt       integer NOT NULL,
  model_id      text,                       -- NULL for a deterministic stage
  tier          text CHECK (tier IN ('cheap','balanced','strong')),
  status        text NOT NULL CHECK (status IN ('running','ok','error','cancelled')),
  input_tokens  integer,
  cached_input_tokens integer,
  output_tokens integer,
  cost_micros   bigint,                     -- §10.2. Declared, not billed
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  error_code    text
);

-- One row per session that a runner has claimed. §7.3's dispatch lock and
-- heartbeat live here; a session with no row has no run in flight.
CREATE TABLE session_runs (
  session_id    uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  runner_id     text NOT NULL,              -- the fly machine that claimed it
  status        text NOT NULL CHECK (status IN ('running','done','error','cancelled')),
  cancel_requested boolean NOT NULL DEFAULT false,
  heartbeat_at  timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);

CREATE TABLE stories (
  session_id    uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  title         text,
  markdown      text NOT NULL,
  word_count    integer NOT NULL,
  prosody       jsonb NOT NULL,             -- the draft's own measured block
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

Four properties worth naming:

- **`works.text` holds the cleaned full text.** A corpus is tens of megabytes at
  most and prosody is recomputed whenever the segmenter's version changes
  (§4.2). Storing the cleaned text rather than re-fetching makes that
  recomputation free and offline, and it is what makes a cached card
  reproducible rather than merely present.
- **`passages` is a table, not a JSON array in the card.** Exemplars cite a
  passage row, so "selectable, never editable" is structural: there is no field
  on the card holding quotation text that a write could reach.
- **`style_cards.build_key` is unique.** Rebuilding a card with identical
  inputs is a cache hit, not a version 4 (§4.4).
- **`session_runs` is the whole of the distributed-systems surface.** It is the
  one table that exists because the pipeline runs in a different process from
  the routes that start and observe it. Everything else in this schema would be
  identical in a single-process design.

### 3.3 Migrations

nexus's design, taken close to verbatim because the driver is now the same one
it was written for:

- `packages/migrations/sql/NNNN_name.sql` is the schema's history, one coherent
  migration per file. `0001` creates the ledger.
- `bun run build` inlines every file into `src/generated/manifest.ts` as
  `{ version, name, sql, checksum }`, committed. Inlined rather than read from
  disk so a bundled serverless function cannot find zero migrations at runtime —
  the worst failure this package has, and the one nexus actually shipped.
- `ensureSchema()` runs on access. Fast path is one statement
  (`SELECT max(version) FROM _auteur_migrations`), memoized in a module-level
  promise. Only when that says the database is behind does it take
  `pg_advisory_lock(<constant>)`, re-read the ledger, verify checksums, and apply
  each pending migration in its own transaction with its ledger row written
  inside it. The advisory lock is what serialises every Vercel function
  instance, the Fly runner and a developer's laptop pointed at the same branch —
  which is precisely the situation SQLite's `BEGIN IMMEDIATE` could not have
  covered.
- It is called from three places: the Vercel request handler's first use, the
  Fly runner's boot sequence, and a build-time step, so a bad migration fails
  the deploy rather than the first request after it.
- **Never edit an applied migration.** Checksums are verified on every boot and
  a mismatch aborts. Rollback is a new forward migration.
- `bun run migration:new` scaffolds a file. It does not apply one.

Because two deploy units run at once during a rollout, **a schema change ships
in expand / migrate / contract order**: add the column nullable, deploy code
that writes both, backfill, deploy code that reads the new one, drop the old in
a later migration. The deploy never assumes the previous version has stopped
running. This is the `migrations` guideline's rule and it is load-bearing here
in a way it was not in the single-process draft.
---

## 4. The style card

### 4.1 Schema

`PRD.md` §5 gives the shape. What is added here is the provenance envelope, the
toolchain versions, and the exemplar's pointer into `passages`.

```ts
type Origin = "measured" | "derived" | "edited";

/** Every qualitative field the card presents is wrapped. Invariant 2. */
type Claim<T> = {
  value: T;
  origin: Origin;
  /** Required when origin is "derived": the passage the model read it from. */
  citation?: { passageId: PassageId; workId: WorkId; workTitle: string };
};

type StyleCard = {
  id: CardId;
  author: AuthorRef;
  version: number;                    // "borges@3"
  provenance: "full-text" | "secondary";
  /** Citation coverage: cited derived fields over derived fields. §4.5 */
  confidence: number;
  /** The four facts the UI shows beside it, unblended. §4.5 */
  cardStrength: {
    measuredWords: number;
    workCount: number;
    /** The largest single work's share of measured words, 0 to 1. */
    largestWorkShare: number;
    citedDerivedFields: number;
    derivedFields: number;
  };
  sources: WorkRef[];
  measuredWords: number;

  /** The versions the numbers were produced by. Part of `buildKey`. */
  toolchain: { cleaner: string; segmenter: string; prosody: string };

  /** Computed from the corpus. No model. Not wrapped: it is all `measured`. */
  prosody: ProsodyBlock;              // §4.3

  /** What the draft aims at. Defaults, field by field, to `prosody`. */
  prosodyTarget: ProsodyTarget;

  voice: {
    pov: Claim<string>;
    tense: Claim<string>;
    narratorDistance: Claim<string>;
    freeIndirect: Claim<string>;
    reliability: Claim<string>;
  };
  diction: {
    register: Claim<string>;
    concreteness: Claim<string>;
    signatureLexicon: Claim<string[]>;
    avoidedRegisters: Claim<string[]>;
  };
  dialogue: {
    tagConventions: Claim<string>;
    dialectRendering: Claim<string>;
    speechToNarrationBalance: Claim<string>;
  };
  structure: {
    openingMoves: Claim<string[]>;
    closingMoves: Claim<string[]>;
    sceneVsSummary: Claim<string>;
    typicalShapes: Claim<string[]>;
  };
  imagery: {
    recurringImages: Claim<string[]>;
    motifs: Claim<string[]>;
    preoccupations: Claim<string[]>;
  };
  rhythm: { devices: Claim<string[]>; repetitionHabits: Claim<string> };
  antiPatterns: Claim<string[]>;

  exemplars: {
    passageId: PassageId;             // the text lives in `passages`, not here
    workId: WorkId;
    workTitle: string;
    year?: number;
    demonstrates: string;
  }[];                                // 8 to 15
};
```

`prosody` is not wrapped in `Claim`, deliberately: a `Claim<number>` whose
`origin` could be anything but `measured` is a type that permits invariant 1 to
be broken. The measured block is a plain `ProsodyBlock`, `prosodyTarget` is
where a value can be `edited`, and no code path writes the first.

The overlay is the PRD's, with the origin required:

```ts
type CardOverlay = {
  sessionId: SessionId;
  cardId: CardId;
  fields: Record<string, { value: unknown; origin: "derived" | "edited"; reason?: string }>;
};
```

`resolveCard(card, overlay)` in `style-card` is the only way the pipeline or the
UI reads a card. It returns the same `StyleCard` shape with overlaid fields'
`origin` set to `edited`, so nothing downstream needs to know an overlay exists
and nothing can read a card and forget to apply one. Its companion
`overlaidPaths(overlay)` is what the report needs in order to know which
targets to score twice (§9.3).

**Editability ships as schema only in v1**, as `PRD.md` §5 decides. The overlay
table exists, `resolveCard` applies it, `ProvenanceMark` renders `edited`, and
the report handles an edited target. **No code path writes an overlay in v1** — not a route and
not a stage. The `edited` field in the design's step-3 mockup is the mechanism
being demonstrated, not a behaviour the pipeline has: §4.6.

### 4.2 `text` — segmentation, and why it is versioned

Every number in this product is a comparison between a corpus measured once and
a draft measured later. The comparison means something only if both were
measured by the same code, so the segmenter is a package carrying a version
string, and that string is part of the card's cache key. **Changing the
segmenter invalidates every cached card**, which is the correct and cheap
outcome: the cleaned texts are stored (§3.2), so a rebuild recomputes prosody
from disk with no model call and no network.

Four things a naive implementation gets wrong, each of which silently corrupts a
metric rather than failing:

- **Unwrap Gutenberg's hard wrap.** Plain-text Gutenberg files are wrapped at
  roughly 70 columns. Treating a blank-line-separated block as a paragraph is
  right; treating a *line* as one is not, and a naive paragraph metric over a
  hard-wrapped file reports a mean paragraph length near ten words for every
  author who ever lived. `unwrap` joins lines within a block, keeping breaks at
  verse, at a line ending in a sentence terminator followed by an indented
  line, and inside anything the cleaner marked as not prose.
- **Sentence segmentation with an abbreviation list.** Split on a run of
  `.`/`!`/`?`/ellipsis followed by whitespace and an opener (quote, bracket, or
  an uppercase letter), with three exceptions: a shipped abbreviation list
  (`Mr.`, `Mrs.`, `Dr.`, `St.`, `Co.`, `etc.`, `i.e.`, `e.g.`, single-letter
  initials), a period between digits, and an ellipsis followed by a lowercase
  continuation. The list is data, not code, and is part of the segmenter's
  version. It is English-and-translation shaped, which is what the corpus is
  (§5.2).
- **Declare the dialogue convention.** Dialogue ratio is the fraction of words
  inside quotation marks, which reports **zero** for a text that marks speech
  with an em dash, as several translations and several modernists do. So `text`
  detects the convention (`double`, `single`, `guillemet`, `em-dash`, `none`),
  the card records it as `prosody.dialogueMarker`, and the metric measures
  against the one found. A corpus mixing conventions across works records
  `mixed`, and the UI says so instead of showing a number that means nothing.
- **Count words one way.** A token is a maximal run of letters, digits,
  apostrophes and internal hyphens, Unicode-aware, with a leading or trailing
  apostrophe stripped. Not `split(/\s+/)`: em-dash-joined words, ellipses and
  quotation marks all attach to tokens and inflate every per-1k rate by a few
  percent, which is enough to move a band verdict and not enough to notice.

The cleaner is versioned separately (`works.cleaner_version`), because
re-cleaning requires re-fetching and re-segmenting does not.

**Gutenberg cleaning** strips everything before the start marker and everything
from the matching end marker; the older `Etext` marker variants; transcriber's
notes; the licence trailer; illustration captions; and chapter headings, which
are structure rather than prose and would otherwise register as very short
sentences and very short paragraphs. A file matching **no** marker variant is a
fetch failure, not a text: one loud error beats a card built from a licence.

### 4.3 `prosody` — the metrics, defined

```ts
type ProsodyBlock = {
  words: number;
  sentenceLength:  { mean: number; median: number; p10: number; p90: number; stdev: number };
  paragraphLength: { mean: number; median: number };
  punctuation: {                      // occurrences per 1,000 words
    emDash: number; semicolon: number; colon: number;
    ellipsis: number; exclamation: number; question: number;
  };
  dialogueRatio: number;              // 0 to 1
  dialogueMarker: DialogueMarker;
  mattr: number;                      // 0 to 1. See below
  latinateRatio: number;              // 0 to 1
  commonBigrams: string[];
  /** The same measures per work, so the card can show the spread. */
  perWork: Record<WorkId, WorkProsody>;
};
```

Two definitions the PRD leaves open, and that do not survive being left open:

**Type-token ratio is replaced by MATTR.** `PRD.md` §5 lists `typeTokenRatio`,
and raw TTR falls as text length rises — a property of Heaps' law, not of the
author. A 900,000-word corpus and a 1,000-word story have mechanically
incomparable TTRs, so scoring one against the other, which `PRD.md` §10 makes
an automatic success criterion, would report every short story as more lexically
various than every author who ever wrote a novel. The fix is standard and cheap:
**moving-average TTR over a fixed 1,000-word window**, stride 100, averaged over
windows. A text shorter than one window reports MATTR over its whole length and
the report marks the measure `insufficient-length` rather than comparing it.
Flash length is about 1,000 words, so this is the common case rather than an
edge one.

**Latinate ratio is a declared heuristic, and it has to earn its place.** No
etymological dictionary ships here, so the measure is a suffix-and-prefix
classifier: a shipped list of Latinate suffixes (`-tion`, `-sion`, `-ment`,
`-ity`, `-ance`, `-ence`, `-ous`, `-ate`, `-ify`, `-ive`, `-able`) plus an
exception list for the common Germanic words those suffixes catch — `table`,
`late`, `gate`, `give`, `live`, `hive`, `went`, and the rest of a closed set of
short high-frequency words. It is labelled a proxy wherever it appears — the UI
reads `latinate ratio (suffix proxy)` — and both lists are part of `prosody`'s
version.

**The measurement is exhaustive, not sampled.** Every token in the corpus is
classified in one pass; it is a set lookup per word, so a million words is
milliseconds and there is no sampling error to reason about. Sampling would buy
nothing and cost reproducibility.

**The classifier is the open question, and it is settled by measurement rather
than by argument.** Build step 3 (§15) includes a hand-labelled validation set:
around 500 word *types* drawn by frequency from a real corpus, each tagged
Latinate or not, checked in as a fixture. The classifier's precision and recall
against that set are a test output, and they decide where the measure lands:

| Precision on the validation set | What ships |
|---|---|
| At or above 0.85 | One of the five scored measures (§9.1), reported with a band and a verdict |
| Below 0.85 | Evidence only: it goes into the drafting prompt as a register hint and out of the report entirely |

Two properties make that gate honest. The validation set is drawn by frequency,
so it weights the words that actually occur rather than the dictionary's tail.
And it is checked in, so tuning the suffix list against it is a visible diff
rather than a quiet fit — and a suffix list tuned until it passes is a fit to
500 labels, which the fixture's own comment says.

A deterministic proxy applied identically to corpus and draft is what the
comparison needs. What it does not need is a proxy nobody measured, presented
next to four measures that mean something.

`commonBigrams` are the 25 most frequent adjacent-word pairs after dropping
pairs where both words are stopwords. They are the one measure here that is more
useful as evidence in the drafting prompt than as a scored number, and they are
not scored.

`perWork` exists for `PRD.md` §13's second risk, a card overfitting to one work.
A card drawing 60% of its measured words from one novel is then visible in the
UI as a spread rather than as a single number, and §4.5's `cardStrength` shows
that share beside the card's confidence.

### 4.4 Cache key and versioning

```
buildKey = sha256([
  authorId,
  sortedWorkIds.join(","),
  toolchain.cleaner, toolchain.segmenter, toolchain.prosody,
  extractionPromptVersion,
  extractionModelId,
].join(" "))
```

- **A cache hit is a `buildKey` match**, returning the existing row. Same
  author, same works, same toolchain, same prompt, same model: same card.
- **A miss inserts `version = max(version) + 1`** for that author, so the UI's
  `borges@3` is a real identity and an older session keeps pointing at the card
  it was built with. Cards are never updated in place.
- **Editing a prompt bumps every card that prompt built.** That is why
  `extractionPromptVersion` is in the key, and why prompts live in one pure
  package whose exports carry a version constant. A prompt edit is then a
  reviewable diff with a visible consequence rather than a silent change in what
  the product believes about an author.
- `extractionModelId` is in the key because two models reading the same passages
  do not produce the same card, and a card that does not record which model
  wrote its qualitative half cannot be compared with another.

### 4.5 Confidence is citation coverage, and nothing else

`confidence` exists for exactly one purpose: telling the reader how much of the
card is backed by evidence. It appears in the three places the design specifies
— the author row, the research header's `borges@3 · full-text · confidence
0.86`, and the prosody caption — and **nothing in the system branches on it.**
No stage reads it, no tier resolution consults it, no route refuses on it.

Given that, it is one ratio with a stateable meaning:

```
confidence = citedDerivedFields / derivedFields
```

The fraction of qualitative fields whose `Claim` carries a `citation` (§4.1).
`0.86` reads as "twelve of fourteen fields cited", and the UI says exactly that
on hover. A `secondary` card (§5.5) has no verbatim passages to cite, so it
scores zero on the same definition rather than through a special case.

**An earlier draft of this section blended four terms** — measured words, work
count, corpus concentration and citation coverage — at weights of 0.35, 0.25,
0.20 and 0.20. The four *facts* are the four ways a card is thin and they are
worth showing. The weights were invented, and a two-decimal number produced from
invented weights claims a precision it does not have. It also breaks the design
system's own content rule: numbers carry their own argument, and the app says
the thing itself rather than a summary of it.

**So the other three facts are shown as themselves**, beside it in the research
header and the author row:

```
12 works · 214,000 words · 61% from one collection · confidence 0.86
```

That line is more informative than any scalar, needs no weights to defend, and
lets a reader who cares about corpus concentration see it rather than have it
averaged into invisibility. `style-card` returns all four as `cardStrength`, and
the third is rendered as the largest single work's share of measured words —
which is what `perWork` (§4.3) is stored for, and the number a person can act
on.

**What counts as too low is deliberately unanswered**, because nothing branches
on it. If the discrimination script (§10.3) shows a relationship between
coverage and output quality, that is when a threshold has evidence behind it.

### 4.6 Nothing edits a target. The conflict is stated in the prompt.

The design's step 3 shows `prosodyTarget.sentenceLength.mean` as `edited`,
lowered from a measured 28.4 to 24 "to fit flash length". The mockup is
demonstrating the provenance mechanism, and the temptation is to make the
pipeline the thing that produces it — to have `draft` quietly lower a target
when the preset and the measurement conflict.

**Decision: it does not. In v1 nothing writes an overlay at all.**
`prosodyTarget` equals `prosody`, field for field, for every card the product
builds.

The conflict the mockup is pointing at is real: at flash length a corpus mean of
28.4 words leaves a 1,000-word story about thirty-five sentences, which is thin
ground for six beats. But lowering the target is the wrong instrument for it.
It substitutes a number the product invented for a number it measured, three
stages before anyone can see whether the substitution was necessary, and it
makes the style-fit report argue with itself (§9.3). The measurement stops
being the thing the draft is compared against, which is invariant 1 in
everything but name.

**The draft prompt carries a precedence clause instead.** The targets are given
as what the prose should aim at, followed by an explicit instruction that they
describe a corpus and not a quota: where hitting a target would cost the story
its coherence at the requested length — not enough words to carry sentences of
that length, a beat that cannot be told in the sentence count available — the
story wins, and the drift is expected and will be reported. One clause in
`prompt`, versioned with the rest of it (§4.4).

Three things follow, all of them better than the overlay version:

- **The drift is visible rather than hidden.** A flash Borges story comes in at
  a mean of 22 against a measured 28.4, `style-fit` reports it as drift against
  the real corpus number, and the report's prose says why — which is a true
  statement about a real tension. The overlay version reports `pass` against a
  target the product moved, and tells the reader nothing.
- **The report keeps one basis.** Every measure is scored against the
  measurement. §9.3's two-verdict path stays in the code for v1.1's editing UI
  and has no v1 producer.
- **It is falsifiable.** If flash-length drafts drift badly on sentence length
  across many authors, that is evidence in `stories.prosody` that the clause is
  too weak, and the fix is the prompt or the preset's word target. The overlay
  version would have made the same drafts look fine.

`provenance-suite` asserts the strong form: **no code path writes
`card_overlays` in v1** (§11.2). The table, `resolveCard`, the `Claim` origin
and the amber `ProvenanceMark` all exist and are exercised by tests with a
hand-built overlay, because `PRD.md` §5 is right that deferring the schema is
the expensive mistake. Deferring the *writer* costs nothing.

---

## 5. Corpus

### 5.1 The provider seam

`PRD.md` §8 gives it, with one addition — search results carry the fields the
author screen renders, and a provider says which of them it can supply:

```ts
type CorpusProvider = {
  id: string;
  kind: "full-text" | "secondary";
  searchAuthors(query: string, signal: AbortSignal): Promise<AuthorResult[]>;
  fetchEvidence(author: AuthorRef, signal: AbortSignal): Promise<Evidence[]>;
};

type AuthorResult = {
  id: AuthorId;                 // provider-scoped
  displayName: string;
  birthYear?: number;
  deathYear?: number;
  workCount: number;
  /** Present only when this author's corpus is already fetched. §5.3 */
  measuredWords?: number;
  /** Present only when a card exists for this author. §5.3 */
  card?: { version: number; exemplarCount: number; confidence: number };
  kind: "full-text" | "secondary";
};

type Evidence =
  | { kind: "passage"; workId: WorkId; charStart: number; charEnd: number; text: string }
  | { kind: "claim"; text: string; source: { title: string; url: string } };
```

`style-card`'s builder consumes `Evidence[]`, never a provider, so the second
provider changes nothing about it. Author search unions across registered
providers and the UI badges each row by `kind`, so the screen is already shaped
for a provider that does not exist.

### 5.2 `corpus-gutenberg`

Four steps, three of them cached in `works` and `passages`.

**Author search** is `GET https://gutendex.com/books?search=<query>&languages=en`,
debounced at 250ms in the browser and aborted on the next keystroke. Results are
books; the provider folds them into authors by the `authors[].name` gutendex
reports and counts works per author.

**gutendex has no author id**, so `authors.id` is minted here: the provider slug,
then the reported name slugified, then the birth year when one is given —
`gutenberg:borges-jorge-luis-1899`. It is stable as long as the name string is,
and a name that changes upstream produces a second author row rather than a
silently rewritten card cache. Disambiguation between two authors sharing a name
is what the birth year is for, and the UI shows dates on every row for the same
reason.

> **Unverified.** This session had no network access to gutendex, so the field
> names above are from the API's public documentation and not from a live
> response. Build order step 3 (§15) begins with a probe script — the same
> pattern as nexus's `scripts/probe-router-responses.ts` — that records one real
> response as a fixture and pins the zod schema against it. Every field name in
> this section is a claim that probe either confirms or corrects, and the code
> parses rather than casts (invariant 4), so a wrong guess is a loud parse
> failure on the first search rather than a silent `undefined`.

**English texts, whichever translation Gutenberg has.** The segmenter's
abbreviation list, the suffix classifier and the dialogue-marker detector are
all English-shaped, so measuring a Spanish original with them produces numbers
that look fine and mean nothing. Borges and Chekhov therefore enter through
their translators, and the product does not treat that as a defect to apologise
for: a translation is the prose an English reader has, and it is the prose the
draft is measured against.

`sources[].translator` is recorded when gutendex reports one, and the author
detail line names it ("Constance Garnett translations", as the design's own
sample data does) — not as a caveat but because it is a fact about which text
was read, the same as the work title. `corpus-select` prefers a single
translator across a corpus where the choice exists, since mixing translators
mixes two prose styles into one set of numbers; where it does not, it takes what
is available and the card lists them. A future non-English tier is a `text`
package per language, not a flag.

**Text fetch** takes the plain-text format from the book's `formats` map,
preferring UTF-8. A book offering no plain-text format is dropped from
selection, not fetched as HTML: stripping Gutenberg's HTML is a second cleaner
with a second set of failure modes for no gain while the plain-text corpus is
this large.

**Work selection** — the `corpus-select` stage (§6.2), the only model call in
this package's path. It is given titles, years, word counts and first passages,
never full texts, and returns up to twelve work ids with a one-line reason each.
Its instruction is `PRD.md` §13's mitigation: sample across career period and
across form. The reasons are stored and shown as the stage's streamed detail
lines, which is what makes the `corpus-select` panel say "12 works sampled
across 1935 to 1975" rather than "Analyzing...".

**Passage selection** is deterministic and needs no model. Candidate passages
are windows of 400 to 900 words cut on paragraph boundaries by `text`'s cut
ladder (§2), sampled uniformly across each selected work's length with the first
and last 5% excluded — front matter and endings are unrepresentative in opposite
directions. Around forty candidates go to `style-extract`, which cites the ones
it uses; a candidate nothing cites is still stored, because an exemplar the user
excludes and later re-includes must still exist.

### 5.3 Author search cannot show a word count, and says so

The design's author rows read `12 works · 214,000 words · prosody computed, 12
exemplars`. Two of those four facts are unknowable at search time: a word count
requires downloading the texts, and an exemplar count requires a built card.
Search-as-you-type cannot download a million words per keystroke.

**Resolution.** `AuthorResult.measuredWords` and `.card` are optional and are
populated from local tables, so the detail line has three forms:

| State | Detail line |
|---|---|
| Never fetched | `12 works · not yet measured` |
| Corpus cached, no card | `12 works · 214,000 words measured · no card yet` |
| Card cached | `12 works · 214,000 words · 61% from one collection · card@3, confidence 0.86` |

The design's row is the third form and is correct for the author it shows, which
in the mockup is the one already built. This is a deviation from the handoff
only in that the other two states exist; the copy above follows the design's own
rule that degradation names which part is missing and why.

### 5.4 Rate limits and failure

gutendex is a free public service and this is a local single-user app, so the
budget is politeness rather than throughput: at most four concurrent requests,
one retry on a 5xx or a timeout with 2s then 4s backoff, and no retry on a 4xx.
A fetched work is never re-fetched — `works` is the cache and it is keyed by
source url plus `cleaner_version`.

A work that fails to fetch is dropped from the corpus with a stage detail line
naming it, and the card is built from the rest. A card built from fewer works
than `corpus-select` chose records both counts, and `cardStrength` shows the
shortfall (§4.5) without a special case. **The author screen refuses only when zero works
fetch**, which is an error, not a low-confidence card.

### 5.5 The secondary tier, designed and not built

`PRD.md` §8 is the design and this document adds nothing to it except where it
lands in the schema: `authors.kind = 'secondary'`, `style_cards.provenance =
'secondary'`, `prosody` absent, `exemplars` empty, and `confidence` zero on
§4.5's definition, since a card with no verbatim passages has nothing to cite. The design shows the row disabled with the reason stated, which is
right, and the type system already carries the distinction, which is the part
that matters now.

---

## 6. The generation pipeline

### 6.1 The engine

`PRD.md` §7 defines a pipeline declaratively so that alternative pipelines are
configuration. Two changes to its `Stage` type, both forced by the design:

```ts
type Pipeline = { id: string; name: string; stages: Stage[] };

type Stage = {
  id: string;
  role: "research" | "fetch" | "measure" | "question"
      | "outline" | "draft" | "revise" | "critique";
  /** `undefined` for a deterministic stage: no model, no cost, no tier badge. */
  tier?: Tier;
  promptTemplate?: PromptRef;         // absent iff tier is absent
  outputSchema?: ZodTypeAny;
  streams: boolean;
  /** Stages whose artifacts this one consumes. Drives §7.5's staleness. */
  reads: StageId[];
};

type Tier = "cheap" | "balanced" | "strong";
```

- **`role: "measure"` and an optional `tier`.** The design's research screen
  shows `prosody-compute` as a stage with no tier, and the handoff's stage list
  folds it into `style-extract`. Both are pointing at the same fact: computing
  prosody is a step the user watches, takes time, and involves no model. Making
  it a stage with no tier is what lets the stage graph express it, gives it a
  `Thinking` row with a null tier badge, and stops the tier-resolution code from
  having a "some stages have no model" special case. §13 resolves the conflict.
- **`reads: StageId[]`.** The re-entry invalidation in §7.5 is derived from this
  rather than written by hand per step, which is the difference between a rule
  and seven `if` statements.

The engine is a `for` loop over stages with three responsibilities and no
others: resolve `tier` to a model, run the stage, and append events. It holds no
knowledge of what any stage means. `clarify` is the one stage that re-enters
itself (§6.5), and it does so by returning a "not done" result the loop
re-dispatches, bounded by the loop rather than by the stage.

### 6.2 The default pipeline

```
corpus-select    research  cheap      Which works, and why each
work-fetch       fetch     —          Fetch and clean the selected works
prosody-compute  measure   —          The deterministic block, on full text
style-extract    research  balanced   The qualitative half, cited to passages
clarify          question  balanced   Questions with suggestions; re-enters (§6.5)
outline          outline   balanced   Beat sheet
draft            draft     strong     The prose (§6.6)
critique         critique  cheap      Style-fit findings vs card and prosody
revise           revise    strong     Targeted revision
style-fit        measure   —          The deterministic report (§9)
```

Three stages more than `PRD.md` §7's table, all of them deterministic, all of
them things the PRD describes without giving a stage: fetching and cleaning,
computing prosody, and computing the report. Naming them costs nothing and buys
the research screen its progress rows and the report its own place in the graph.

`single-pass`, per the PRD, is one `draft` stage with the card inlined plus the
two `measure` stages it needs. No engine work.

### 6.3 Tier resolution, and the model panel

The design adds a surface the PRD does not have: an overlay listing every stage,
its tier, the model it resolved to, the price per million input tokens, and a
`Select` to pin a different model for the session. Resolution is therefore three
layers, in order:

1. **The catalog** — `provider-router`'s `models()`, snapshotted at
   registration. A constant, checked against `GET /v1/models` by a script, for
   the reasons nexus's `models.ts` documents at length: the models route is the
   OpenAI model-list shape and carries no context window, no max output, no tool
   support and no price, so it can filter this list and could never build it.
2. **The tier map** — `config/tiers.ts`, an ordered candidate list per tier.
   Resolution takes the first candidate the catalog contains **and** that meets
   the stage's requirements: structured output when the stage has an
   `outputSchema`, and enough `maxOutputTokens` when the stage is `draft` under
   `single-call`. A tier with no eligible candidate is a startup error naming
   the tier and the stage, not a runtime surprise mid-session.
3. **The session pins** — `stage_pins`. A pin overrides the tier map for one
   stage in one session. It is validated against the same stage requirements, so
   pinning a model that cannot emit `json_schema` to `outline` is refused with
   the reason, not accepted and then failed on.

The layering is deliberately identical to the card overlay's: canonical
defaults, per-session overrides, per-field reset, and the UI marks what is
overridden. One mechanism, learned once.

#### What a tier actually declares

Not a price band. `cheap`, `balanced` and `strong` are price-shaped words for a
quality-shaped decision, and taking them literally leads to the wrong question
("is this stage worth paying for?") instead of the right one:

> **A tier declares how much a mistake at this stage costs.**

`corpus-select` choosing two odd works is recoverable — the card is built from
ten others and the spread is visible in `perWork`. `critique` missing a finding
costs one revision pass. `draft` is the product: a bad draft is the session.
That ordering is what the tiers encode, and it is why the candidate lists happen
to run cheap-to-expensive rather than being defined that way — cheapness falls
out of asking for less capability, and the list's ordering already carries it.

Two consequences worth stating, because they are what the framing buys:

- **The stage-to-tier assignment is a hypothesis, and it is testable.** `PRD.md`
  §7 asserts `outline` needs `balanced` and `critique` can be `cheap`, and
  nothing has tested either. Once the pipeline runs, moving a stage down a tier
  and reading the style-fit numbers and the discrimination script (§10.3) is a
  cheap experiment. The tier map is data (§14) precisely so that experiment is a
  config edit.
- **A tier is not a substitute for the user choosing.** It answers "which model
  runs `outline`" before anyone has opened the panel, and that is all. Layer 3
  is the answer once they have.

#### One model for everything

The design's panel pins stages one at a time, which is right for someone who
wants `draft` on a particular model and does not care about the rest. It is
wrong for the commoner case: someone who has one model they trust and wants the
whole pipeline on it.

So the panel gets one control the design does not have — **"use one model for
every stage"**, a single `Select` above the table that writes a pin for all
seven rows at once. It is validated per stage like any other pin, so a model
that cannot emit `json_schema` is refused for the six typed stages with the
reason rather than silently applied to `draft` alone. Clearing it returns every
row to its tier default, which is the "Follow tier defaults" button the design
already specifies.

This costs one control and no new mechanism — it is seven writes to
`stage_pins` — and it means the tier vocabulary is something a user can ignore
entirely rather than something they have to learn to get what they want.

### 6.4 What `provider-router` needs added

Three additions to `ModelDescriptor` and one to `ModelRequest`. All four are
additive; nothing in the adapter's streaming or error handling changes.

```ts
type ModelDescriptor = {
  // ... nexus's fields ...
  /** Ceiling on tokens one call may produce. Selects the draft strategy (§6.6). */
  maxOutputTokens: number;
  /** Whether this model accepts `text.format: json_schema` with `strict: true`. */
  structuredOutput: boolean;
  /** Declared list price, USD micros per million tokens. §10.2. */
  pricing: { inputPerMillion: number; outputPerMillion: number; cachedInputPerMillion?: number };
};

type ModelRequest = {
  // ... nexus's fields ...
  /** Present when the stage has an `outputSchema`. */
  format?: { name: string; schema: JsonSchema; strict: true };
};
```

`responses-request.ts` gains one branch: `format` present sets
`text: { format: { type: "json_schema", name, schema, strict: true } }`. That is
the whole of the structured-output work, and it is the reason taking nexus's
adapter beats adapting argo's — argo's is built on the same Responses API but
without the catalog, the fixtures or the error mapping.

**`structuredOutput` and `maxOutputTokens` are per-model facts this document
does not know.** Neither is in the OpenAI model-list shape and neither is
uniform across a gateway fronting nine labs, so both are columns in the catalog
constant, and `scripts/check-router-catalogue.ts` is extended to print what the
gateway reports for each. Establishing them is build order step 2 (§15) and it
is a spike against the live endpoint, not a guess in this table.

**`pricing` is declared, not discovered.** The gateway's models route carries no
price, so the table is checked into the repository beside the catalog, and every
cost this product shows is labelled an estimate from declared list prices
(§10.2). A price that has moved is a wrong estimate, which is why the number is
shown as an estimate; presenting it as a bill would be the error.

**Fallback when a tier has no structured-output model.** Not an accepted state:
resolution fails at startup (layer 2 above) rather than degrading. The
alternative — prompt for JSON, parse, retry once on failure — is a second code
path whose failures look like model quality problems, and it exists in this
design only as a documented non-choice. If the spike in step 2 finds that no
cheap-tier model on the gateway supports strict schemas, the answer is that
`critique` runs at `balanced`, not that the pipeline grows a repair loop.

### 6.5 `clarify`, the one stage that re-enters itself

The stage returns:

```ts
type ClarifyResult = {
  questions: {
    id: QuestionId;
    text: string;
    /** The story decision this resolves. Non-empty, min 8 chars. */
    decision: string;
    /** Why the answers so far did not settle it. Non-empty, min 16 chars. */
    whyNotSettled: string;
    suggestions: string[];            // 2 to 4
    dependsOn: QuestionId[];
  }[];
  done: boolean;
};
```

`PRD.md` §6 says a question that cannot state its purpose is not asked. In this
schema that is not a prompt instruction but a **parse failure**: `decision` and
`whyNotSettled` are required non-empty strings, so a question without them
never reaches the UI. The engine additionally drops any question in round 2 or 3
whose `whyNotSettled` does not reference at least one answered question id or
answer text, because "the idea does not specify a frame" is a valid reason in
round 1 and a non-answer in round 3.

The budget is the engine's, not the prompt's: **3 rounds, 8 questions**, counted
in `pipeline` and enforced by truncating the round rather than by asking the
model to behave. A prompt-level budget is a suggestion; `PRD.md` §6 calls the
budget the thing that makes this a wizard, so it is a constant in code with a
test.

**The tree.** `dependsOn` is stored per question. Editing an answer marks every
transitive descendant `invalidated`; the rows stay for the decisions log and the
UI re-asks them. Round 1 questions have an empty `dependsOn`, so the tree is
shallow at first and the machinery is unexercised — which `PRD.md` §6 accepts
deliberately, because retrofitting it is expensive and building it now is a
column and a graph walk.

**"Generate now" is live from the end of round 1** and is a client-side jump to
`outline`, not a separate pipeline entry. Unanswered questions become
`skipped`, and each one becomes a decisions-log row with origin `model chose —
question skipped`. A decision no question was ever asked about is
`model chose — not asked`, written by the `outline` stage's own structured
output, which returns the choices it made that the answers did not determine.
That second category is what makes the design's decisions log honest: the
interesting entries are the ones the wizard never surfaced.

### 6.6 Length and draft strategy

`PRD.md` §7's rule, with the arithmetic made explicit because it decides
behaviour:

```
strategy = wordTarget(preset) * TOKENS_PER_WORD * SAFETY <= model.maxOutputTokens
             ? "single-call"
             : "sequential-scene"
```

`TOKENS_PER_WORD` is 1.4 and `SAFETY` is 1.15. Both are constants with a comment
naming what they are: an English-prose token ratio and headroom for a model that
overshoots its target. The point of the formula is that the strategy follows from
the drafting model's real `maxOutputTokens`, so pinning a different model in the
panel can change the strategy, and the UI must show the strategy it resolved to
rather than the one the preset suggests. The design already does this — the Idea
screen's Length field hint *is* the resolved strategy.

`sequential-scene` runs one call per outline beat, each given: the resolved card,
the full outline, a running story-state summary, and the verbatim last 500 words.
After each beat it runs `critique` against the card's prosody targets, so drift
surfaces at beat 3 rather than at 12,000 words. The running summary is itself a
`cheap`-tier call after each beat, and it is the one place this pipeline
accumulates state across calls.

### 6.7 Live drift is not `critique`

The design's draft screen shows prosody with pass/drift verdicts updating while
the prose streams, at flash length under `single-call` — where `critique` has
not run and will not until the draft is complete.

**Resolution: live drift is a deterministic measurement, not a stage.** The
server re-measures the accumulated draft with `prosody` on every paragraph
boundary (a blank line in the stream), compares against the resolved
`prosodyTarget`, and emits a `drift` event. It costs no tokens, involves no
model, and reuses the identical metric functions the card and the report use —
which is the only reason its numbers are comparable to theirs.

Two measures are suppressed while the draft is short: `mattr` until 1,000 words
(§4.3) and `dialogueRatio` until the marker convention has appeared at all.
Showing a dialogue ratio of 0.0 as a `pass` against a target of 0.08 after two
paragraphs is a verdict about nothing.

### 6.8 Streaming, cancellation and usage

- **Every stage emits events**; `streams: false` means it emits a start and an
  end and no deltas. The web app therefore has no branch for "stages that show
  progress" — §7.2's event vocabulary is total.
- **Cancellation** is one `AbortSignal` per session, passed to the provider and
  to `fetch`. Aborting mid-stage marks the `stage_runs` row `cancelled` with the
  tokens already billed recorded, because a cancelled call is still a call the
  gateway charges for.
- **Usage accounting** writes one `stage_runs` row per provider call, with
  nexus's three-way input decomposition (`inputTokens` excludes cached counts)
  preserved. Cost is computed at write time from the model's declared pricing and
  stored as `cost_micros`, so the rail footer's `spend $0.04` is one `SUM` and a
  later price change does not silently rewrite the history of what a session
  cost.

### 6.9 Regenerate a selection

`PRD.md` §4 puts editing the finished story out of scope "beyond regenerating a
section", and §6 step 7 offers it. The unit is the question: under
`sequential-scene` a section is an outline beat with recorded boundaries, and
under `single-call` — flash and short, the default and where most sessions will
be — the whole story arrived in one response and nothing recorded where any beat
ended.

**Decision: the unit is the user's text selection, not a beat.** The result
screen's prose is selectable; selecting any span turns the ghost button into
"Regenerate selection". The addressable unit is a character range into
`stories.markdown`, which exists identically under both strategies, so there is
no beat-to-offset mapping to build and no stage to align one.

It is also the better unit. A reader who wants a paragraph fixed wants *that
paragraph*, not the structural division it happens to sit in — and beats are
something the user saw once, on the outline screen, two steps earlier.

**It is the `revise` stage with a span instead of findings.** Same role, same
tier, same model, same prompt package; where the post-critique path passes
findings and their remedies, this path passes a character range and the
instruction to replace it. Everything else is already built:

- The prompt gets the resolved card, the full outline, the whole story with the
  span marked, and the verbatim 300 words either side for voice continuity —
  which is `sequential-scene`'s continuity context under a different name.
- The replacement is spliced by offset, and `stories.markdown` is rewritten with
  its `prosody` recomputed.
- **Staleness handles the consequences for free** (§7.5). A rewritten draft
  artifact is a changed input, so `critique`, `revise` and `style-fit` restale
  and the report is recomputed rather than left describing prose that no longer
  exists. Nothing new to invalidate.
- A `decision` event records it, so the decisions log shows the regeneration
  the same way it shows a skipped question.

Two constraints, both from the same reasoning:

- **A selection may not span the whole story.** That is not a regeneration, it
  is a re-draft, and the rail already offers re-entering step 6. The route
  refuses above 60% of the word count with `invalid_input`.
- **A selection is snapped outward to sentence boundaries** by `text` before it
  reaches the prompt. Regenerating half a sentence produces a splice that reads
  as a splice, and the segmenter that decides where a sentence ends is already
  the one measuring the result.

---

## 7. The server

auteur deploys as **two units and one database**, which is nexus's topology
and is taken for nexus's reason.

| Unit | Runs | Holds |
|---|---|---|
| `apps/auteur-web` on **Vercel** | The Vite client as a static build, and eleven of the fourteen routes as functions | Every read and every short synchronous write. Nothing that outlives a request. |
| `apps/auteur-runner` on **Fly.io** | One long-lived Hono process | The pipeline engine, the SSE fan-out, `/cancel`, and the internal dispatch endpoint. |
| **Neon** | Postgres | Everything in §3. The only thing both units share. |

**Why the runner is not a function**, which is the whole argument for the
split: a run is minutes of work — §10 targets a median under four minutes to
first token, and a novelette under `sequential-scene` is far longer — and it
must survive the client closing the tab, which a handler driven by the client's
own request cannot. The SSE fan-out is the same problem from the other side: it
pushes from an in-memory broker in the process that is running the stages, and
an ephemeral plural instance has neither the process nor the broker.

**Why the rest is not on Fly.** Eleven routes are a query and a small write.
Putting them on the machine would mean the machine is in the request path for
every keystroke of author search, and it buys nothing: they are exactly what a
function is for.

The seam between the two is one signed internal call. `POST /advance` on Vercel
computes what is stale (§7.5), writes the intent, dispatches to the runner over
an HTTP call authenticated with a shared secret, and **returns immediately**.
It never blocks on the run. The client then opens the SSE stream against the
runner and watches.

Three costs this topology has that a single process did not, each paid
explicitly rather than discovered:

- **The client talks to two origins.** Vercel for the routes, Fly for `/events`
  and `/cancel`. That is a CORS configuration and a second base URL in the
  client. The alternative — SSE on Vercel polling the `events` table — replaces
  a push with a poll and gives up token-latency streaming, which is the draft
  screen's entire point. Rejected.
- **A heartbeat and a stale-run sweeper.** §7.3. An earlier draft of this
  document said auteur needed neither, because the pipeline and the SSE endpoint
  were the same process as everything else. They are not any more, so nexus's
  reason for having them is now auteur's reason.
- **Expand / migrate / contract on every schema change** (§3.3), because two
  deploy units are live at once during a rollout.

`PRD.md` §4 puts hosting out of scope. This corrects it, and the correction is
the reason §3 resolves to Postgres rather than to a file.

### 7.1 Routes

Fourteen, described once in `api-contract` as zod, with `api-client` generated
from the same object so a contract change breaks both sides' compile together.
The contract records which unit serves each one, so the client's two base URLs
are derived from it rather than remembered.

```
── Vercel (apps/auteur-web) ────────────────────────────────────────────
GET    /api/health
GET    /api/models                                  the catalog, per tier

POST   /api/sessions                                { idea, lengthPreset, constraints? }
GET    /api/sessions/:id                            the whole session, for a reload
PATCH  /api/sessions/:id                            idea, preset, constraints, step
DELETE /api/sessions/:id

GET    /api/authors?q=                              search, unioned across providers
POST   /api/sessions/:id/author                     { authorId } — starts research

POST   /api/sessions/:id/answers                    { questionId, answer | skip }
POST   /api/sessions/:id/advance                    { to: Step } — runs what is stale
POST   /api/sessions/:id/regenerate                 { kind: 'outline' } | { kind: 'selection', from, to }

PUT    /api/sessions/:id/pins                       { [stageId]: modelId }
GET    /api/sessions/:id/export                     text/markdown

── Fly (apps/auteur-runner) ────────────────────────────────────────────
GET    /api/sessions/:id/events?cursor=N            text/event-stream
POST   /api/sessions/:id/cancel

── internal, signed, never reached by a browser ────────────────────────
POST   /internal/dispatch                           { sessionId, stages }
```

`/cancel` is on the runner because the `AbortSignal` it aborts lives in that
process. A cancel routed through Vercel could only set a flag the runner would
have to poll, which turns an immediate stop into a delayed one for no gain.
`session_runs.cancel_requested` still exists, as the record of what happened and
as the path a sweeper uses; the live cancel does not depend on it.

`POST /advance` is the only route that starts work, and it starts **exactly the
stages that are stale** (§7.5). That is what makes every step re-enterable
without the client knowing which stages a given re-entry invalidates: the client
says where it wants to be, the server works out what that costs.

### 7.2 The event vocabulary

One closed union, and the order is part of the contract.

```ts
type SessionEvent =
  | { type: "stage_start";  stageId: StageId; role: Role; tier?: Tier; modelId?: string }
  | { type: "stage_detail"; stageId: StageId; line: string }
  | { type: "stage_delta";  stageId: StageId; text: string }
  | { type: "stage_end";    stageId: StageId; elapsedMs: number; usage?: Usage; costMicros?: number }
  | { type: "stage_error";  stageId: StageId; code: ErrorCode; message: string }
  | { type: "card";         card: StyleCard }
  | { type: "questions";    round: number; questions: Question[]; done: boolean }
  | { type: "outline";      outline: Outline }
  | { type: "drift";        measures: FitMeasure[] }        // §6.7
  | { type: "report";       report: StyleFitReport }
  | { type: "decision";     entry: DecisionEntry }
  | { type: "step";         step: Step }
  | { type: "session_end";  reason: "complete" | "cancelled" | "error" };
```

`stage_detail` carries the lines the design's `Thinking` rows render, and they
are produced by the server rather than composed in the browser. That is what
makes them honest: "12 works sampled across 1935 to 1975" is a fact the
`corpus-select` stage returned, not a sentence the UI assembled from a spinner.

### 7.3 Durability and replay

Taken from nexus's run-store design, with the ordering rule intact:

**Every event is appended to `events` before it is pushed to any subscriber.**
Not the reverse. An event a subscriber saw but the table did not is lost on the
next reconnect, because the client advances its cursor past a `seq` it can never
replay. `seq` is gap-free per session, from 1, allocated inside the same
transaction as the insert.

`GET /api/sessions/:id/events?cursor=N` replays from `events` at the cursor and
then continues live from the in-memory broker. `stream-client` remembers the
highest `seq` it delivered, reconnects with it, and drops anything at or below
it — so delivery is exactly-once from the consumer's point of view whether the
server replays from the cursor or after it.

Failure behaviour, adapted from nexus's table:

| Failure | Behaviour |
|---|---|
| Connection drops, or the stream ends without `session_end` | Reconnect from the cursor with exponential backoff, up to a bounded number of consecutive attempts that deliver nothing, then fail with an error the UI renders |
| 404 — the session is gone | Fatal at once |
| A frame that will not parse | Fatal at once. Reconnecting from the same cursor refetches the same bad frame forever |
| `close()` | Idempotent, aborts the in-flight request, stops reconnecting |

**A heartbeat and a sweeper, which an earlier draft of this document said were
unnecessary.** That draft's reasoning was that the pipeline and the SSE endpoint
were the same process as everything else, so a dead process was a dead server
and the browser's reconnect was the whole recovery path. Under §7's topology the
runner dies independently of the client and of the routes, so nexus's reason for
having them is now auteur's:

- The runner writes `session_runs.heartbeat_at` every few seconds while a run is
  in flight.
- A run whose heartbeat is older than a small multiple of that interval is
  reaped: `session_runs.status` becomes `error`, every `stage_runs` row of that
  session still `running` becomes `error` with code `internal`, and a
  `stage_error` event is appended so a reconnecting client is told why its run
  stopped rather than watching a stream that never advances.
- The sweep runs on the runner's own boot and on a timer, and it is idempotent,
  so two runners sweeping at once is not a race.

**The dispatch lock is the same row.** `session_runs.session_id` is the primary
key, so a claim is an insert that either succeeds or conflicts. Two dispatches
for one session cannot both start a run, which is what stops a double-clicked
"advance" from running the pipeline twice against one event log.

### 7.4 Errors

`errors` is nexus's shape with auteur's taxonomy. None of nexus's
status-as-security-property reasoning applies — auteur is single-user — so the
mapping is ordinary:

```ts
type ErrorCode =
  | "not_found"            // 404
  | "invalid_input"        // 400
  | "corpus_unavailable"   // 502 — gutendex is down or the work will not fetch
  | "corpus_unusable"      // 422 — fetched, but no Gutenberg markers (§4.2)
  | "provider_error"       // 502 — the gateway or the model failed
  | "rate_limited"         // 429
  | "model_unavailable"    // 409 — the pinned or resolved model 404s at the gateway
  | "schema_violation"     // 502 — a stage's output did not parse (invariant 4)
  | "budget_exceeded"      // 409 — the round or question budget, if a caller asks past it
  | "cancelled"            // 499
  | "internal";            // 500
```

Two rules carried over verbatim because they are right anywhere: every error
thrown from `packages/` is an `AuteurError` with a code from this closed set —
no bare `throw new Error`, no silent catch — and `toHttpResponse` refuses to
forward the message of anything that is not one, because an unexpected throw is
the one case whose message was not written with a reader in mind and can carry a
provider's raw response.

`schema_violation` is worth its own code rather than folding into
`provider_error`: it says the call succeeded and the *output* was wrong, which
is a prompt or a schema bug and is fixed in a different file from a gateway
failure.

### 7.5 Re-entry, as computed staleness

`PRD.md` §6 requires every step to be re-enterable, with a specific
invalidation rule per step. Implementing that as seven `if` statements is where
this kind of wizard rots. Instead:

**Every artifact stores the hash of the inputs it was produced from. An artifact
is stale when that hash no longer matches.**

```
inputKey(stage) = sha256([ stage.id, stage.promptVersion, resolvedModelId,
                           ...stage.reads.map(inputKeyOf) ,
                           ...directInputsOf(stage) ].join(" "))
```

`directInputsOf` is the session state the stage reads directly: the idea and
preset for `outline`, the author id for `corpus-select`, the answer set for
`clarify` and `outline`, the resolved card id for everything after research.
`stage.reads` (§6.1) supplies the rest transitively.

The consequences fall out rather than being coded:

- Changing an answer changes the answer set, so `outline`, `draft`, `critique`,
  `revise` and `style-fit` go stale and the card does not.
- Changing the author changes `corpus-select`'s direct input, so everything
  after it goes stale and the idea survives.
- Changing the length preset restales `outline` and `draft` and not the card.
- Pinning a different model for `outline` restales `outline` onward, which is
  the correct and non-obvious answer: a beat sheet from a different model is a
  different beat sheet.
- Re-entering a step and changing nothing restales nothing, so the design's
  clickable completed rail rows are free.

`POST /advance` runs the stale stages between where the session is and where it
was asked to go, in graph order, and skips the rest. The decisions log and the
answers survive independently: invalidated questions keep their rows (§6.5), so
"you answered this, then changed it" remains visible.

### 7.6 Export, and the label

`export` renders the story as markdown. One rule, and it is structural rather
than a convention:

**`renderExport` takes the label as a required parameter and there is no code
path that produces an export document without it.** `PRD.md` §9 requires every
export and every story view to carry "Generated by auteur in the style of X.
AI-generated text; not written by the author." Making the label a caller's
responsibility means one day a caller forgets. Making it a required argument of
the only function that can produce the document means the type system asks for
it, and `provenance-suite` (§11.2) asserts that every export fixture contains
it.

The exported document carries, after the prose: the label, the author and card
version, the style-fit summary, and the decisions log. A reader who did not run
the session can then tell what was chosen for them, which is the same claim the
result screen makes.

---

## 8. The web app and the design system

`apps/auteur-web` is Vite + React, one route, seven steps and one overlay. The
whole visual system arrives from `docs/design/`, so most of this section is
about porting it in a way that cannot drift.

### 8.1 `tokens` — the Panda preset, gated by the CSS

nexus's pattern, verbatim in approach:
`docs/design/design-system/tokens/*.css` is the source of truth, `packages/tokens`
is that file set expressed as Panda tokens, and **its test re-reads those CSS
files at test time and re-derives every expectation** rather than transcribing
values. A wrong hex digit, a rounded pixel, a dropped token or a renamed
condition is then a red build rather than a shipped bug, and the test cannot
drift into agreeing with a mistake.

Naming is the design system's custom-property name with the leading `--`
removed: `--ink-900` becomes `colors["ink-900"]`, `--space-4` becomes
`spacing["space-4"]`, `--type-title` becomes `textStyles["type-title"]`. More
verbose than idiomatic Panda, and the point is that a value in a specimen card,
in the handoff CSS and in a component all read identically.

Three things differ from nexus and are the auteur-specific work:

- **The theme condition is inverted.** auteur's dark theme is the base `:root`
  and light is `:root[data-theme="light"]`. So the wired condition is
  `_light: '[data-theme="light"] &'` and there is no `_dark`: dark is what the
  raw token values already say. Getting this backwards produces an app that is
  correct in light mode and unstyled in dark.
- **Two grounds, not one.** The system's structural rule is ink for the
  instrument, paper for the artifact, and it is carried by two families of
  semantic aliases (`--surface-*` / `--text-*` against `--surface-paper*` /
  `--text-paper*`) that both exist simultaneously on the dark theme. Panda
  handles this as ordinary tokens; what needs a mechanism is the rule that prose
  never lands on ink — see §8.3.
- **`prefers-reduced-motion` is missing from the bundle and is added.** The
  design ships five durations and no reduced-motion block. Every animation here
  is small, and two of them (`auteur-pulse` on a running stage dot,
  `auteur-caret` on streaming prose) run continuously for minutes, which is
  exactly the class of motion the preference exists for. So `tokens` wires
  `_reducedMotion` and collapses `dur-instant` through `dur-stream` to `0ms`,
  following nexus's finding that a Panda condition on a semantic token is the
  only mechanism that survives Panda's cascade layer ordering. This is an
  addition to the design bundle, not a correction of it, and it is listed in §13.

### 8.2 `component-library` — built from the bundle, not ported from argo

`PRD.md` §12 calls argo's `component-library` "the largest single time saving".
It is not, and this is the second correction to §12.

The design system that arrived is auteur's own: 15 components in five groups,
with `.d.ts` prop contracts that do not match argo's. `Card` takes
`ground: "ink" | "panel" | "paper" | "outline"` — a distinction argo has no
concept of. `Badge` takes `tone` values that are model tiers and provenance
states. `Markdown` takes `ground` and `streaming`. Four of the fifteen
(`ProsodyStat`, `ProvenanceMark`, `Exemplar`, `WizardRail`) exist because this
product has measurements, provenance, citations and a re-enterable wizard, and
argo has none of those. Porting argo's eight and then rewriting every prop union
to match the `.d.ts` files is more work than implementing fifteen small
components against a complete token system — and it would leave a Phosphor
dependency in a Lucide system.

What is taken from argo instead is the *approach*, which nexus shares: wrap a
headless kit rather than hand-rolling focus management, expose variants as
explicit props, never a `className` passthrough, and communicate state to CSS
through `data-*` attributes. Both reference repos use Base UI and it is the
right choice here for the same reasons — `Select`, `Textarea` and the modal
overlay all want real keyboard and focus behaviour.

The fifteen — sixteen exports, since `CardHeader` ships with `Card` — with the
contract each must satisfy:

| Group | Components | Contract |
|---|---|---|
| `core` | `Button`, `Card`, `CardHeader`, `Badge`, `Icon` | `docs/design/design-system/components/core/*.d.ts` |
| `forms` | `Field`, `Input`, `Select`, `Textarea` | `.../forms/*.d.ts` |
| `prose` | `Markdown`, `Exemplar` | `.../prose/*.d.ts` |
| `pipeline` | `Thinking`, `ProsodyStat`, `ProvenanceMark`, `WizardRail` | `.../pipeline/*.d.ts` |
| `theme` | `ThemeToggle` | `.../theme/*.d.ts` |

Prop names and unions match those files exactly. Where a `.prompt.md` beside a
component states a behavioural rule, that rule is a test:
`Exemplar` has no code path that mutates its `text`; `ProsodyStat` renders the
target as a hairline tick distinct from the value marker; `WizardRail` renders
completed steps as clickable and pending steps as not.

### 8.3 The ink/paper rule, made checkable

"If a design puts generated prose on the dark ground, or a prosody number on
cream, it is wrong" is the system's own strongest statement, and it is the kind
of rule that decays into a review comment. Two mechanisms:

- **`Markdown` and `Exemplar` default to `ground="paper"`** and the story,
  outline and exemplar surfaces pass no ground at all. The default is the
  correct answer, so the wrong answer requires typing.
- **`ProsodyStat` has no paper variant.** It renders against ink aliases only.
  A measurement on cream is then not a styling mistake but an impossible
  component state.

The theme resolver is ported close to as-is from
`docs/design/wizard-handoff/theme.js`: `auto` resolved by local clock (light
06:00 to 18:00), re-checked each minute so a session left open crosses over,
explicit choice persisted in `localStorage` under `auteur.theme`, and the script
in `<head>` before first paint so there is no flash of the wrong ground.

### 8.4 `copy` — the content rules as tests

Every user-facing string lives in `copy`, and the design system's content
fundamentals become assertions over the module rather than review comments:

- No emoji, anywhere. No exclamation marks — the one `!` in the system is a row
  label in the punctuation-frequency table, which is a data label and is
  exempted by name.
- Sentence case outside proper nouns, including buttons and table headers. The
  wordmark is lowercase `auteur` in every position.
- No in-app "we", "I" or "Let's". The user is addressed as "you".
- No terminal period on a label or a button.
- Machinery is named verbatim and in mono: a test asserts that every stage id,
  schema path and tier name that appears in copy is one the code actually
  defines, so `style-extract` in a string and `style-extract` in the pipeline
  cannot diverge.
- The banned-words list from the design guide (`AI-powered`, `magic`,
  `effortless`, `seamless`, `unleash`, `craft` as a verb, `in seconds`, `just`)
  is a test, and so is the absence of `Analyzing...` and its family.

The last two are the ones worth having automated. The rest are habits; those two
are claims the product makes about itself.

### 8.5 `formatting`

nexus's four functions plus the three auteur needs, all pure and deterministic,
none reaching for `toLocaleString`:

| Function | Renders |
|---|---|
| `relativeTime` | `just now`, `4m ago`, `12 Mar` |
| `pluralize` | `1 work`, `12 works` |
| `metaRow` | `card@3 · full-text · confidence 0.86` |
| `elapsed` | `1.9s`, `14.5s`, `2m 04s` — the `Thinking` row's mono time |
| `prosodyValue` | `24.6 w`, `6.4/1k`, `0.08` — one decimal for counts, two for ratios, and never a trailing zero that implies precision the metric does not have |
| `money` | `$0.04`, `$0.15` — always two decimals, always with the estimate qualifier supplied by the caller (§10.2) |

`prosodyValue` earns its place: the number of decimals a measurement is shown to
is a claim about its precision, and getting it right in one function beats
getting it wrong in twenty call sites.

### 8.6 Screens

The seven screens and the model overlay are specified screen by screen in
`docs/design/wizard-handoff/README.md`, down to the copy, and this document does
not restate them. Three notes on how they attach to what is above:

- **The rail's mono notes** (`1,042w`, `borges`, `card@3`, `3/8`, `flash`) come
  from the session state, not from per-screen props, so a completed step's note
  survives a reload. They are derived in one selector.
- **The result screen's three tabs** are `story`, `fit` and `log`, which are
  three reads of one session and not three fetches. `GET /api/sessions/:id`
  returns all three.
- **The draft screen shows ink and paper at once**, which the handoff calls the
  point of the system: prose on a paper card in the main column, drift
  measurement on ink in the sticky aside. It is also the screen that exercises
  §6.7's live measurement, so it is the one to build first when the design port
  needs proving.

---

## 9. The style-fit report

`PRD.md` §10 calls this the measure that keeps the project honest. It has two
halves and they must not be confused: a deterministic half that runs on every
story and cannot be argued with, and a prose half from the `critique` stage that
explains what the numbers mean.

### 9.1 Bands

A verdict compares the draft's measure to the **corpus interquartile band**,
which is `PRD.md` §10's criterion. For a measure computed over sentences
(sentence length), the band is the interquartile range of that measure over the
corpus's sentences. For a measure that is one number per work (punctuation
rates, dialogue ratio, MATTR, latinate ratio) the band is the interquartile
range across `perWork` values (§4.3) — which is why `perWork` is stored and not
just the aggregate. A card built from fewer than four works has too few points
for a quartile, records `bandBasis: "range"`, and the report says the band is a
range rather than an interquartile band.

```ts
type FitMeasure = {
  path: string;                   // "prosody.sentenceLength.mean"
  label: string;
  value: number;                  // the draft's
  band: [number, number];
  bandBasis: "iqr" | "range";
  corpusValue: number;            // the measurement
  targetValue: number;            // what the draft aimed at
  targetOrigin: Origin;           // always "measured" in v1 (§4.6)
  status: "pass" | "drift" | "fail" | "insufficient-length";
};
```

**Five measures are scored**, which is `PRD.md` §10's list with §4.3's
substitution: mean sentence length, punctuation rate (semicolon, em dash and
colon, each separately), dialogue ratio, MATTR and — subject to §4.3's
precision gate — latinate ratio. The rest of
`ProsodyBlock` is evidence for the drafting prompt and is not scored —
`commonBigrams` because it is a lexicon rather than a measure (§4.3), and
`paragraphLength` because a beat sheet decides it more than a voice does.

`pass` is inside the band. `drift` is outside the band but within 1.5 band
widths of it. `fail` is beyond that. Two thresholds, in one constant, with the
reason they exist: a binary in-or-out verdict makes every near miss look like a
failure, and the design's own `ProsodyStat` status union already has four values.

### 9.2 What `critique` adds

`critique` receives the resolved card, the `FitMeasure[]` and the draft, and
returns findings. Its output schema forces the shape the design's copy rules
demand — a finding states the number and its argument:

```ts
type Finding = {
  path: string;                   // must be a path in the card or the measures
  status: "pass" | "drift" | "fail";
  /** The number and its consequence. The schema requires both a digit and a clause. */
  text: string;
  /** For a drift or fail: what a revision would change. */
  remedy?: string;
};
```

`path` is validated against the card and the measures, so a finding cannot cite
a field that does not exist. A finding whose `text` contains no digit is dropped
by the engine: the product's claim is that numbers carry the argument, and a
finding reading "the voice feels slightly off" is the failure mode this whole
design exists to avoid.

`revise` receives the findings with `status !== "pass"` and their remedies, and
revises against those specific measures rather than being asked to "improve the
style". Its output is re-measured, so a revision that fixes sentence length and
breaks dialogue ratio is visible.

### 9.3 An edited target is scored twice

`PRD.md` §5 is explicit: the report must not score a story against user-invented
targets as if they were the author's real statistics. So for any measure whose
`targetOrigin` is `edited`, the report carries
**both** verdicts — against the target and against the corpus measurement — and
the UI shows both with the edited one marked amber. The design's step-7 closing
caption already says this: "one target was overridden this session and is
reported against both, separately."

The rule in code: `style-fit` returns `FitMeasure[]` where an edited measure
appears twice, once with `targetOrigin: "edited"` and once with
`targetOrigin: "measured"`. There is no single-verdict path for an edited
measure, so nothing downstream can render only the flattering one.

**No v1 code path produces one** (§4.6): every target equals its measurement,
so this branch is exercised only by tests with a hand-built overlay. It is in
v1 because the schema decision `PRD.md` §5 makes is worthless if the report
cannot honour it, and because a report that has never been asked to carry two
verdicts is a report that will not when the editing UI lands.

---

## 10. Cost, and the success criteria as instrumentation

`PRD.md` §10 sets five targets. Four are computed by this system on itself, and
naming where each one is read from is what stops them being aspirations.

| Measure | Target | Read from |
|---|---|---|
| Style fidelity | inside the interquartile band on the five scored measures | `style-fit`, on every story (§9) |
| Blind discrimination | judge picks the real passage no more than 70% of the time | Not instrumented in the app. §10.3 |
| Completion | at least 70% of started sessions reach a finished story | `sessions.step` reaching `result`, counted locally |
| Time to draft | median under 4 minutes, idea to first prose token | `stage_runs.started_at` on `corpus-select` to the first `stage_delta` of `draft` |
| Cost | median story under $0.15 | `SUM(stage_runs.cost_micros)` per session |

### 10.1 Telemetry is local and is a table

`PRD.md` §4 puts hosting and accounts out of scope, so there is nowhere to send
telemetry and nothing to send it about. Completion rate and time-to-draft are
therefore queries over `sessions` and `stage_runs`, and the only consumer is a
`bun run stats` script. That is enough for the two targets to be checkable and
it adds no surface.

### 10.2 Cost is an estimate and says so

The gateway's models route carries no pricing (§6.4), so cost is computed from a
declared price table checked into the repository. Three consequences, all
stated in the UI:

- Every money figure is qualified once per surface: the rail footer reads
  `spend $0.04 est.` and the model panel's session estimate says
  `estimated from declared list prices`.
- `cost_micros` is computed and stored at write time, so a later price-table
  edit does not rewrite what a past session is recorded as having cost.
- Cached input tokens are priced at the cached rate where the model declares
  one, which is why nexus's three-way input decomposition is preserved verbatim
  in §6.8. Folding cached tokens into the input count would over-report cost by
  a large multiple on a long-corpus session, and nothing would catch it.

The $0.15 median target is checkable against `stage_runs` from the first
end-to-end run, which is the point: `PRD.md` §7's cost argument for multi-tier
routing is a claim, and this is the table that either supports it or does not.

### 10.3 Blind discrimination is a script, not a feature

`PRD.md` §10 tracks it and does not gate on it. It runs as
`bun scripts/discrimination.ts`: hold out passages from the corpus that
`corpus-select` did not choose, generate matched passages, and ask a judge model
to pick the real one. Keeping it out of the app is deliberate — it needs
held-out data the pipeline deliberately did not use, and building it into a
session would mean the session either used the held-out passages or wasted the
fetch.

---

## 11. Testing and the CI gates

### 11.1 The regime

**`[open]` in `PRD.md` §12 — resolved: the document-index regime, seeded from
`ac-zeitgeist/agent-guidelines`.** See
`docs/IMPLEMENTATION-PLAN.md` §1 for the selection and
`docs/decisions/0001-document-index-regime.md` for the decision.

An earlier draft of this section resolved it the other way, toward nexus's
one-file regime, on the grounds that the packages being taken are nexus's and
that argo's index — nine documents with authority levels and a mandatory
post-edit audit — costs a re-read of several documents per change. That cost is
real, and it is now accepted rather than avoided. What changed the answer:
`agent-guidelines` ships the guidelines themselves, with tiers and triggers that
do the per-change filtering, a `local/` mechanism that gives auteur's four
adaptations somewhere to live without editing a seeded file, per-package
promotion, and a lock file that makes a later refresh a readable diff. The
one-file version has nowhere to put any of that: it compresses ~1,950 lines of
rules into ~200 and loses the rationale, and its adaptations are edits with no
record of what they replaced.

The property worth keeping from nexus is not the file count — it is that **a
rule that is not a gate is a rule that decays.** §11.2's gates are that half,
and gate 10 extends it to the guidelines themselves: a seeded document edited in
place fails the build.

So auteur's `AGENTS.md` is the generated index, `docs/guidelines/` holds the 24
seeded documents, and `docs/guidelines/local/` holds the six auteur-specific
ones. The rules below are what the local set and the index carry beyond the
seed:

- The four invariants (§0), and the instruction to resolve ambiguity toward them.
- **Tests and implementation land together.** A package with implementation
  files and no colocated `*.test.ts` fails by construction. TDD is the practice,
  and this is the enforceable half of it.
- **Code offensively.** No defensive guard, no catch-and-swallow, no silent
  fallback. Throw an `AuteurError` or return a `Result`.
- **No `any`, no non-null assertions in `packages/`, no `as`-cast of external
  data.** Parse with zod (invariant 4).
- **Tokens only** in UI code, and the two ink/paper mechanisms from §8.3.
- **Every user-facing string in `copy`**, with §8.4's rules asserted there.
- The dependency, contract and catalog gates below.
- The two commands: `bun run turbo test` and `bun run preflight`.

The velocity cost the PRD worries about is real. `docs/IMPLEMENTATION-PLAN.md`
§1.7 states it plainly and names the three things that bound it: tiers filter
per change, per-package addenda make the common case local, and the gates
enforce the load-bearing half regardless.

### 11.2 The gates

Ten, all in CI, each with a self-test proving it can fail (nexus's
`gate-self-test.ts`, taken verbatim — a gate nobody has watched reject a defect
is a gate nobody knows works).

| # | Gate | What it catches |
|---|---|---|
| 1 | `biome check` | Lint and format |
| 2 | `tsc --noEmit` per package | Types |
| 3 | `bun test` per package | Unit tests, colocated |
| 4 | `api-surface.ts --check` | A widened public surface without a manifest edit |
| 5 | `check-dependencies.ts` | Layer violations, cycles, non-`catalog:` deps, `component-library` reaching past its five |
| 6 | `new-package.ts --check` | Generated skeletons drifted from the manifest |
| 7 | `tokens`' preset test | A token value that no longer matches the design CSS (§8.1) |
| 8 | `provenance-suite` | Invariant 2. Below |
| 9 | `dependency-min-age` | A dependency version younger than the release-age window |
| 10 | `check-guidelines.ts --check` | A seeded guideline edited in place, an index that no longer matches what was ported, or a `local/` override naming a document that was not (§11.1) |

Plus two scripts that need credentials and therefore run on demand rather than
in CI: `check-router-catalogue.ts` (the catalog against `GET /v1/models`) and
`probe-router-responses.ts` (the SSE fixtures against the live gateway). Both
come from nexus and both are worth running once per contributor, not once.

**`provenance-suite` is auteur's analogue of nexus's boundary-suite**: the
invariant that would otherwise be a habit, turned into a machine that keeps
saying so. It enumerates the exported functions of `style-card`, `style-fit`,
`pipeline` and `export`, and asserts:

- No exported function returns a `StyleCard` whose `prosody` block differs from
  what `prosody` computes from the same works. Invariant 1, as a property.
- Every `Claim` with `origin: "derived"` carries a `citation` whose `passageId`
  exists in `passages`. A derived field with no evidence fails the build.
- **Nothing writes `card_overlays`.** The suite greps the workspace for a write
  to that table outside its own fixtures and fails on one (§4.6). This is the
  v1 form of the rule; when the v1.1 editing UI lands it becomes "only the
  overlay route writes it".
- Every measure with `targetOrigin: "edited"` appears twice in the report
  (§9.3).
- Every export fixture contains the §7.6 label verbatim.

### 11.3 What gets a test, and what does not

The `text` and `prosody` packages are where the test budget goes, and they are
the two places where property tests earn their keep: segmentation and metric
computation have invariants that are easy to state and hard to eyeball
(sentence counts sum to the paragraph's, per-1k rates scale linearly with a
doubled text, MATTR is invariant under repeating a text, an unwrapped text has
the same word count as the wrapped one). nexus's `chunking` uses `fast-check`
for exactly this and the dependency comes along.

The pipeline is tested against a scripted fake provider — nexus's
`scripted-provider.ts`, adapted — so a full run including a stage failure, a
cancellation mid-stream and a `clarify` re-entry is a deterministic test with no
network. That is only possible because the engine does no I/O beyond what it is
handed, and it is worth asserting that it does not, as nexus's
`agent-loop/src/no-io.test.ts` does.

What does not get a test: the seven screens' layout. The component contracts
(§8.2) and the token gate (§8.1) cover what is checkable, and a screenshot test
of a seven-step wizard is a maintenance cost that catches less than the axe audit
`test-support` already brings.

---

## 12. The PRD's open items

| Item | Resolution |
|---|---|
| §12 — adopt argo's `AGENTS.md` regime? | **Yes in shape: the document-index regime, seeded from `agent-guidelines` rather than copied from argo.** §11.1, and decision 0001. The index's cost is accepted and bounded; nexus's contribution is §11.2's gates, which is the half that does not decay. |
| §12 — persistence via `bun:sqlite`? | **No — Postgres on Neon.** §3. The reasons for persistence stand: cards are expensive, a half-finished wizard must survive a reload, and the replayable event log needs somewhere to live. The store changed because §7 puts the short routes on functions, which cannot reach a file. |
| §4 — hosting out of scope | **Corrected.** §7. Two deploy units and one database: the client and eleven routes on Vercel, the pipeline and the SSE stream on one Fly machine, Postgres on Neon. This is nexus's topology, taken for nexus's reason. |
| §9 — the living-author tier's legal position | **Left open. Not an architecture decision.** §5.5 puts the seam and the type distinction in place, and no v1 code path ingests in-copyright primary text. The review the PRD asks for is needed before the v2 tier is built, and this document does not pre-empt it. |

Three further decisions this document makes that the PRD leaves implicit:

| Decision | Where |
|---|---|
| A second `ModelClient` for direct Anthropic is deferred, not built | §2, "Not taken" |
| Type-token ratio is replaced by MATTR | §4.3 |
| The latinate proxy is scored only if it passes a hand-labelled precision gate | §4.3 |
| Nothing writes a card overlay in v1; the draft prompt states the conflict | §4.6 |
| Confidence is citation coverage; the other three strength facts are shown, not blended | §4.5 |
| A tier with no structured-output model is a startup error, not a repair loop | §6.4 |
| Regenerating a section means regenerating a text selection, as `revise` with a span | §6.9 |
| A tier declares how much a mistake at that stage costs, not a price band | §6.3 |
| The model panel gains a "use one model for every stage" control | §6.3 |

---

## 13. Where the PRD and the design bundles disagree

Five conflicts. In each case the resolution is what gets built, and the bundles
are not edited to match.

**1. Is computing prosody a stage?** The design system's UI-kit data lists
`prosody-compute` as a research stage with a null tier; the wizard handoff folds
it into `style-extract` as a detail line. *Resolved: it is a stage with no
tier* (§6.1). Both sources are describing a step the user watches that involves
no model, and making the stage type able to say that removes a special case
rather than adding one. The research screen shows three rows —
`corpus-select`, `prosody-compute`, `style-extract` — as the UI kit does, with
the handoff's detail-line copy.

**2. Can the author screen show a word count?** The design's rows do. *Resolved:
only when the corpus is already fetched* (§5.3). Search-as-you-type cannot
download a million words per keystroke. The three detail-line forms follow the
design's own rule that degradation names which part is missing.

**3. Live drift while a flash draft streams, with no `critique` run.**
*Resolved: live drift is a deterministic measurement, not a stage* (§6.7). The
design is right that the meter should move; the PRD is right that `critique`
runs per scene only under `sequential-scene`. They are describing two different
things and both ship.

**4. An `edited` provenance mark in v1, which has no editing UI.** *Resolved:
the mockup is demonstrating the mechanism, and nothing writes an overlay in v1*
(§4.6). The tension the mockup points at — a corpus mean sentence length that
flash length cannot carry — is real, and it is handled in the draft prompt with
a precedence clause rather than by moving the target. Lowering a measured target
to make a story fit would report `pass` against a number the product invented,
which is the one thing the provenance mechanism exists to prevent.

**5. The model-selection overlay is not in the PRD at all.** *Resolved: built,
as a third resolution layer over the tier map* (§6.3). It is the natural surface
for `PRD.md` §7's rule that tiers resolve from the catalog at run time, and it
layers exactly as the card overlay does. It also forces two things the PRD needs
anyway: pricing in the catalog, and `maxOutputTokens` as the input to the draft
strategy. One control is added to it that the design does not have — "use one
model for every stage" (§6.3) — because pinning seven rows one at a time is the
wrong shape for someone who has one model they trust.

Two things this document adds that neither source asks for:

- **`prefers-reduced-motion`** (§8.1). The bundle ships five durations and no
  reduced-motion block, and two animations run continuously for minutes.
- **`dialogueMarker`** (§4.2). Without it, dialogue ratio silently reports zero
  for any text that marks speech with an em dash, which includes several of the
  translations this corpus is made of.

---

## 14. Risks, and what this document does not settle

`PRD.md` §13's risk table stands. Four risks are specific to this design.

| Risk | Mitigation, or the honest absence of one |
|---|---|
| **The gutendex schema in §5.2 is unverified.** No network access to it from this session. | Build order step 3 begins with a probe that records a real response and pins the schema. Every field is parsed rather than cast, so a wrong guess is a loud failure on the first search. |
| **`structuredOutput` and `maxOutputTokens` per model are unknown.** Neither is in the gateway's models route. | Build order step 2 is a spike against the live endpoint. If no `cheap`-tier model supports strict schemas, `critique` moves to `balanced` and the cost target in §10 gets worse — that is the outcome to measure, not to design around now. |
| **A corpus spanning several translators measures none of them.** Two translators' sentence lengths averaged together are a number no prose has. | `corpus-select` prefers one translator where the choice exists, and the card lists those it drew on (§5.2). Measuring the translation itself is not the risk — that is the prose an English reader has — but blending two is. |
| **The latinate proxy may not classify well enough to score.** It is a suffix list. | Gated rather than hoped about: a hand-labelled 500-type validation set decides whether it is a scored measure or a prompt hint (§4.3). The gate runs in build step 3, before anything depends on the answer. |

Not settled here, and deliberately:

- **Prompt contents.** `prompt` is a package with a version constant per export
  (§4.4) and the prompts themselves are the implementation's work. What this
  document fixes is that they are pure, snapshot-tested, and that editing one has
  a visible consequence in the card cache.
- **The tier candidate lists, and the stage-to-tier assignment.**
  `config/tiers.ts` is data. Which models belong in which tier is a question the
  step-2 spike answers with prices and capabilities in hand; which *stage*
  belongs in which tier is a hypothesis inherited from `PRD.md` §7 that wants an
  experiment once the pipeline runs (§6.3). Both are config edits, which is why
  neither blocks the build.

---

## 15. Build order

`PRD.md` §14's order, with the two spikes moved to the front of the steps they
gate and the design port given its own step.

1. **Monorepo skeleton and toolchain.** `packages.manifest.ts` with every
   package from §1, the nexus scripts, `turbo.json`, `biome.json`, CI, and the
   gate self-test. Gates 1 through 6 and 9 green on an empty repository. Then
   port `ids`, `errors`, `env`, `logger`, `test-support`.
2. **The model gateway.** Take `model-provider` and `provider-router`. **Spike
   first**: `probe-router-responses.ts` against the live endpoint with a real
   key, extended to record what each candidate model reports for structured
   output and max output tokens. Then the §6.4 additions, then
   `check-router-catalogue.ts`, then the price table. Ends with a structured
   output round-tripping against a real model.
3. **`text` and `prosody`.** Before the corpus, because they are pure, they are
   the product's core claim, and they are testable against fixtures with no
   network. Property tests here (§11.3), and the latinate classifier's
   hand-labelled validation set (§4.3) — which is the step that decides whether
   five measures are scored or four. Ends with a real Gutenberg file cleaned,
   unwrapped, segmented and measured, and the numbers eyeballed against the
   text.
4. **`corpus-gutenberg`.** **Spike first**: one real gutendex response recorded
   as a fixture and the schema pinned to it (§5.2). Then search, fetch, work
   selection, passage selection, and the `works`/`passages` cache.
5. **`db` and `migrations`.** The §3 schema, the ledger, `ensureSchema()` under
   the advisory lock, and the ephemeral-Neon-branch test harness. Mostly nexus's
   code, and it comes after 3 and 4 because those two need no database.
6. **`style-card`.** Schema, `resolveCard`, `buildKey`, confidence, the
   extraction stage's prompt and its structured output. Ends with a real card for
   a real author, inspectable as JSON.
7. **`pipeline`.** The engine, the stage graph, tier resolution, the pins, the
   `clarify` re-entry, both draft strategies. Tested against the scripted fake
   provider; then one real end-to-end flash story with the cost read off
   `stage_runs`.
8. **The two apps' server halves.** `api-contract`, the eleven Vercel routes,
   `advance` and the staleness computation (§7.5); then `apps/auteur-runner` —
   the event log, SSE, cancel, the signed dispatch, the heartbeat and the
   sweeper (§7.3).
9. **`tokens` and `component-library`.** The preset with its gate, then the
   fifteen components against their `.d.ts` contracts. This is the step that can
   run in parallel with 6 through 8 — it touches no file they touch.
10. **`apps/auteur-web`.** The seven screens and the overlay. Draft screen first
    (§8.6), because it exercises both grounds and the live measurement.
11. **`style-fit`, `export`, `provenance-suite`.** The report, the label, and
    gate 8.
12. **The deploy.** `vercel.json`, `fly.toml`, the Neon project, the signed
    dispatch secret and the bearer token (§7).

Steps 3, 4 and 6 are the product. Steps 1, 2, 5 and 8 are plumbing and should
not absorb more than they need. Step 9 is the one that can be worked in
parallel; everything else is a chain, and trying to parallelise it produces two
branches editing `packages.manifest.ts`.
