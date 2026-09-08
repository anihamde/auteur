# auteur — Implementation Plan

The work breakdown from an empty repository to a v1 that runs. It says what
each change delivers, which files it owns, what proves it done, and what it
waits on. It does not describe the design: `docs/ARCHITECTURE.md` is the design
and stays the single source of truth.

Precedence when documents disagree:

1. `docs/ARCHITECTURE.md` — the authoritative design.
2. `docs/PRD.md` — product requirements.
3. `docs/design/wizard-handoff/` — screen layout, behaviour and copy.
4. `docs/design/design-system/` — tokens, component props, content rules.

This plan outranks none of them. Where it appears to, the document is wrong and
the fix is a `docs/decisions/` entry, not a silent divergence.

Where the architecture turns out to be wrong or under-specified during
implementation, record it in `docs/decisions/NNNN-<slug>.md` and link it from
the generated `docs/DECISIONS.md` index. Do not diverge without the file.

---

## 1. Guideline selection

The first deliverable. `ac-zeitgeist/agent-guidelines` holds 28 documents in six
bundles; this section says which of them govern auteur, at what authority, and
where auteur's deviations from them are written down.

**auteur takes the document-index regime**: the selected guidelines are copied
into `docs/guidelines/`, and the root `AGENTS.md` is the generated index that
gives each one its authority level. This reverses `ARCHITECTURE.md` §11.1, which
resolved `PRD.md` §12's `[open]` toward nexus's one-file regime. §1.7 records the
reversal and its cost; this PR amends §11.1 so the two documents do not
contradict each other.

### 1.1 The route: run the port

`meta/PORTING.md` is followed as written, script route:

```sh
bun run port --profile local-app --target ../auteur \
  --var PKG_SCOPE=@auteur \
  --var COMPONENT_LIBRARY=@auteur/component-library \
  --var TEST_COMMAND="bun run turbo test" \
  --source-commit "$(git -C ../agent-guidelines rev-parse HEAD)"
```

Guidelines are **copied in, not referenced.** A rule fetched from another
repository is a rule that will sometimes not load, and `agent-guidelines`'
`AGENTS.md` says so directly: do not point an agent in another repository at it.

### 1.2 The profile does not exist yet, and is contributed upstream

No shipped profile fits. auteur needs `frontend` **without** `nextjs` — a Vite
SPA has no App Router, no server components, no server actions and no route
handlers, and `nextjs`'s trigger ("you add or modify a route … or route
handler") would fire misleadingly on every Hono route — and it needs three of
`backend`'s four documents **without** `auth`, because it is single-user with no
accounts. Bundles are taken whole by `extends`, so this is not expressible by
composing existing ones.

`meta/PORTING.md` is explicit that the answer is a new profile, not the nearest
one edited: *"If no profile matches, do not port the nearest one and edit the
result. Compose the bundles you need in a new profile — that is what bundles are
for, and the new profile is then reusable."*

**WP-A0** adds it to `agent-guidelines` in its own PR, in that repository:

```yaml
# profiles/local-app.md
extends: [base, typescript]
include: [react, styling, icons, accessibility, database, migrations, http-api,
          ci, deployment]
vars: [PKG_SCOPE, COMPONENT_LIBRARY, TEST_COMMAND]
```

For: a local-first product application — a client and a server that ship
together, a hosted client, no accounts, no Next.js.

Every `requires` edge is satisfied without adding anything: `react` needs
`functions` and `types` (in `typescript`), `styling`/`icons`/`accessibility`
need `react`, `database` needs `data-boundaries` (in `typescript`), `migrations`
needs `database`, `http-api` needs `data-boundaries` and `security` (in `base`),
`ci` needs `tooling`, and `deployment` requires nothing. Nothing requires
`nextjs`, `auth` or `rust`, so excluding them orphans nothing. Every variable
the selected set declares is bound.

**Proof (WP-A0):** `bun run validate` and `bun run test` pass in
`agent-guidelines` — its validator is what rejects an unbound variable, an
omitted `requires`, an `include` a bundle already provides, and a profile
extending a bundle that does not exist. Then `bun run port --profile local-app`
against a scratch directory writes 25 guideline files and an index naming all
25.

### 1.3 What the port writes into auteur

```
AGENTS.md                          generated index: authority levels,
                                   precedence, the post-edit audit, the PR
                                   "Guidelines audited" requirement
CLAUDE.md                          three lines pointing at AGENTS.md
docs/guidelines/*.md               25 seeded documents, flat, variables bound
docs/guidelines/local/README.md    how to author a repo-specific guideline
docs/templates/package-AGENTS.md   starting point for a package addendum
.agent-guidelines.lock             profile, source commit, bindings, sha256 per
                                   written file
```

### 1.4 The 25 seeded documents

They arrive carrying the tier and trigger their own front matter declares. This
table does not restate `covers` or `trigger` — the ported files carry those, and
duplicating them here creates two things to keep in sync. It records only why
each is in the selection.

**From `base` (8):** `testing`, `errors`, `files`, `language-choice`,
`package-design`, `documentation`, `git-and-prs`, `security`.

`package-design` is `ARCHITECTURE.md` §1's 33 packages as a rule.
`git-and-prs`' conflict-surface rules are §3 of this plan.
`language-choice` arbitrates a choice auteur does not have — kept because the
bundle is taken whole and over-inclusion costs one row in the index.

**From `typescript` (8):** `control-flow`, `functions`, `types`,
`discriminated-unions`, `data-boundaries`, `option-result`, `tooling`,
`monorepo`.

`data-boundaries` is invariant 4 in document form and is promoted repository-wide
by `local/invariants.md` (§1.5). `discriminated-unions` governs `SessionEvent`,
`Evidence`, `ClarifyResult` and `ErrorCode`. `option-result` is relevant at three
seams: provider calls, gutendex fetches, and `resolveCard`.

**Included individually (9):** `react`, `styling`, `icons`, `accessibility`,
`database`, `migrations`, `http-api`, `ci`, `deployment`.

**`database` and `migrations` now apply verbatim rather than adapted**, which
is what `ARCHITECTURE.md` §3 resolving to Postgres on Neon buys: they are
written for exactly that — hand-written SQL, no ORM, serverless connection
rules, and the server converging the schema on access under an advisory lock.
The expand/migrate/contract rule in `migrations` is load-bearing here in a way
it would not have been in a single process: a deploy replaces functions while
earlier invocations are still finishing.

`deployment` likewise applies whole. Its "Vercel is the default" half is the
whole deploy, and its serverless rules — a handler is short-lived, no
in-process state between requests, no local filesystem writes, connections
pooled — are load-bearing rather than incidental: §5.3's stage-per-invocation
model obeys every one of them, which is what makes it work. Its Fly half never
fires, because no work here outlives a request once the unit is a stage.
`ci`'s failure and speed rules are what §2.2 and WP-A1 implement.

### 1.5 Not taken, and the three seeded documents auteur overrides

**Not taken (3).** These are absent from the profile, so they are absent from
`docs/guidelines/` and from the index.

| Guideline | Why |
|---|---|
| `nextjs` | Vite SPA, one route. Every rule describes machinery auteur does not have, and its trigger would fire on Hono route work. |
| `auth` | Single-user, no accounts, no sessions, no protected routes. |
| `rust` | No crate and none plausible: the two hot paths are a set lookup per word over a few million words. |

**Overridden (3 + 2 additions).** The index model has a mechanism for auteur's
deviations that the one-file model did not: a local document with `overrides:`
in its front matter. **The seeded file is never edited** — an in-place edit shows
as drift in `.agent-guidelines.lock` on the next refresh, and the whole point of
the lock is that it stays readable. WP-A5 writes:

| Local document | Tier | Overrides | What it replaces |
|---|---|---|---|
| `local/icons-lucide.md` | if-touched | `icons` | Phosphor becomes Lucide, so the import paths and the `*Icon` suffix rule do not transfer. What survives: one icon per import, size and colour through tokens via the component's own props, decorative icons `aria-hidden`. auteur's closed-set `Icon` wrapper is stricter than the seed. |
| `local/http-hono.md` | if-touched | `http-api` | Steps 1 and 2 (authenticate, authorize) do not exist. Steps 3–5 stand verbatim: parse before doing work, status codes that mean what happened, one error shape, never a 200 carrying an error. |
| `local/react-spa.md` | if-touched | `react` | Strikes "Server Components by default"; everything else stands. |
| `local/invariants.md` | **always** | — | `ARCHITECTURE.md` §0's four invariants, the instruction to resolve ambiguity toward them, and the repository-wide promotion of `data-boundaries`: its trigger fires on nearly every diff in a product that is seven model calls and two HTTP clients, so it is in scope for every change rather than re-decided per diff. |
| `local/ink-paper-and-copy.md` | if-touched | — | The UI and content rules `ARCHITECTURE.md` §11.1 lists that no seeded guideline covers: tokens only, the two ink/paper mechanisms (§8.3), every user-facing string in `copy`, and the content rules §8.4 asserts as tests. `styling` is seeded unmodified and this sits beside it. |

### 1.6 Per-package addenda

The index model's second mechanism, and the answer to its cost (§1.7): a
guideline that is `if-touched` at the root is unconditional inside one package,
and the package says so in its own `docs/AGENTS.md`. Written by the package's
first WP, not by A5:

| Package | Promotes to ALWAYS | Package rules it also holds |
|---|---|---|
| `packages/component-library` | `react`, `styling`, `accessibility`, `icons` | The five packages it may import, and why it stays renderable with no server behind it |
| `packages/migrations` | `database`, `migrations` | Never edit an applied migration; one rewrite-`ALTER` per table per file |
| `packages/db`, the four stores | `database` | — |
| `packages/text`, `packages/prosody` | — | The versioning rule: these two carry version strings that are part of the card's cache key, so a change to either invalidates every cached card |
| `apps/auteur-web` (routes) | `http-api` (via `local/http-hono.md`), `deployment` | — |
| `apps/auteur-web/api` | `http-api`, `deployment` | The stage-queue contract: a stage function claims before it works, enqueues inside its transaction, and is safe to invoke twice |
| `apps/auteur-web` | `react`, `styling`, `accessibility`, `icons` | — |

An addendum never weakens a root rule.

### 1.7 The cost, stated

`ARCHITECTURE.md` §11.1 chose the one-file regime for a reason that has not gone
away: *"argo's `AGENTS.md` is an index of nine guideline documents with authority
levels and a mandatory post-edit audit — a strong regime that costs a re-read of
several documents per change."* auteur's index is 25 documents plus five local
ones, which is more than nine.

That cost is real and it is accepted. Three things bound it:

- **Tiers do the filtering.** 12 documents are ALWAYS (11 seeded plus
  `local/invariants.md`); the other 18 are `if-touched` or `reference` and their
  triggers decide. A typical `packages/prosody` diff is in scope for the ALWAYS
  set and nothing else.
- **Per-package addenda make the common case local.** A `component-library` WP
  reads its addendum's four promotions rather than re-deriving which of 25 apply.
- **Most rules are gates anyway.** §2.2's eleven gates enforce the load-bearing
  half. The documents explain; CI decides.

What is gained over the compressed one-file version: the rationale and worked
examples travel with the rules, `local/*.md` gives auteur's three adaptations a
place that does not require editing a seeded file, `.agent-guidelines.lock` makes
a later refresh a readable diff rather than an archaeology exercise, and the
post-edit audit and the PR "Guidelines audited" line are protocol steps the
one-file version had nowhere to put.

**This is a reversal of a merged architectural decision, so it does not live only
here.** This PR amends `ARCHITECTURE.md` §11.1 and §12's open-item row to state
the index regime and point at the decision; WP-A5 writes
`docs/decisions/0001-document-index-regime.md` with the reasoning above and what
would reverse it — if a contributor is measurably skipping the audit, the
compressed one-file version is the fallback and the lock file makes it
recoverable.

### 1.8 What proves the selection holds

Gate 10, `scripts/check-guidelines.ts --check`, reads `.agent-guidelines.lock`
and asserts:

- every file it records is present and its sha256 matches — **a seeded guideline
  edited in place fails**, which is what routes a deviation to `local/` instead;
- the index in `AGENTS.md` names every ported id, in its declared tier, and names
  no id that was not ported;
- every `local/*.md` has valid front matter, an `overrides:` list naming only
  ported ids, and — for `if-touched` — a trigger;
- every `promotes.always` entry in a package addendum names a ported id that is
  `if-touched` at the root, since promotion is the only direction;
- upstream's catalog has gained no document the lock does not classify as taken
  or not taken.

Its `gate-self-test.ts` cases: a byte changed in a ported file, an id deleted
from the index, a `local` doc overriding an id that was not ported, and an
addendum promoting an `always` document.

---

## 2. Global rules

### 2.1 One reviewable change per PR

A work package is one PR. If a WP's diff cannot be held in a reviewer's head,
it was scoped wrong — split it and add the split to this file in the same PR.

Branch names are the WP id and its subject: `wp-e04-sentence-segmentation`.
Never a generated name.

### 2.2 The eleven CI gates

Nine from `ARCHITECTURE.md` §11.2, plus the guideline gate from §1.8 and the
build gate the deploy makes worth having. All blocking, all on every PR. Gate 11 lands with WP-R1, the first WP that produces a bundle: it is the
only gate that resolves the whole graph through a bundler, so a package nothing
else exercises is invisible until it fails a deploy.

| # | Gate | Command |
|---|---|---|
| 1 | Lint and format | `biome check` |
| 2 | Types | `tsc --noEmit` per package |
| 3 | Unit tests | `bun test` per package |
| 4 | Public surface | `scripts/api-surface.ts --check` |
| 5 | Dependency direction | `scripts/check-dependencies.ts` |
| 6 | Generated skeletons | `scripts/new-package.ts --check` |
| 7 | Token fidelity | `@auteur/tokens`' preset test |
| 8 | Provenance | `@auteur/provenance-suite` |
| 9 | Dependency release age | `scripts/check-min-age.ts` |
| 10 | Guideline index and seed integrity | `scripts/check-guidelines.ts --check` (§1.8) |
| 11 | The client bundles as the deploy will build it | `turbo build` on `apps/auteur-web` |

Each gate carries a case in `scripts/gate-self-test.ts` that proves it rejects
its own defect. A gate nobody has watched reject something is a gate nobody
knows works. Gates 1–3 are a tool's own output and their negative control is
the tool's.

Two scripts need credentials and run on demand, not in CI:
`scripts/check-router-catalogue.ts` and `scripts/probe-router-responses.ts`.

### 2.3 Definition of done

CI green · the WP's Proof column demonstrated by a named test or gate ·
implementation and tests in the same PR · no `TODO` without a WP id · public
surface matches `scripts/packages.manifest.ts` or the PR edits the manifest
deliberately · **the post-edit audit run and the PR body carrying its
"Guidelines audited" line** (§1.3's index requires it; a PR without it is
incomplete) · merged.

### 2.4 Decisions

One decision per file, `docs/decisions/NNNN-<slug>.md`, numbered one past the
last. `docs/DECISIONS.md` is **generated** from that directory by
`bun run decisions:index`, checked by gate 1's task set. Two branches adding a
decision therefore conflict only in the generated index, which is regenerated
after rebase and never hand-merged.

### 2.5 Review

Per the standing preferences: one sub-agent review per PR, at most two rounds,
one GitHub review with comments attached. Skip review entirely for the
mechanical PRs marked **[mech]** below — generated skeletons, catalog bumps,
conflict resolutions taking one side verbatim. Merge those when CI is green.

### 2.6 The CI handover — the first thing that happens, and the one stop

**WP-A1 is the first change in this repository, before the guidelines, before
the manifest, before anything.** It ends by handing the workflow to you and
stopping until you confirm it runs.

**Why the file is staged rather than written to `.github/workflows/`.** The
session's GitHub credentials may not carry the `workflows` permission, in which
case a push touching that directory is rejected outright — and discovering that
on PR forty is worse than designing around it on PR one. So A1 writes the
workflow to `ci/workflows/ci.yml`, which is an ordinary file, and
`docs/CI-HANDOVER.md` gives you the two commands:

```sh
mkdir -p .github/workflows
git mv ci/workflows/ci.yml .github/workflows/ci.yml
git commit -m "ci: activate the workflow" && git push
```

**It hands over; it does not stop the build.** An earlier draft of this plan
blocked the second PR on your confirmation. That is now the wrong trade: you
have asked not to be interrupted mid-build, and the cost of not blocking is
small because every gate is a script that runs locally too. So A1 lands the
staged file and the note, **and the next PR opens immediately**. Whenever you
move the file, CI starts reporting — retroactively on whatever is open by then,
and on everything after. If a gate turns out to be misconfigured in the workflow
rather than in the script, that is one follow-up PR against a file only you can
activate, and the scripts it runs were already green.

**The handover happens once, not once per gate.** The workflow's jobs do not
name individual gates; they invoke `bun run gates` and `bun run gate-self-test`,
and `scripts/gates.ts` is the registry a gate adds itself to. Adding gate 5 in
A3 is therefore a new script plus one line in `gates.ts` — a normal PR, no
workflow edit, no second handover. Everything the workflow file itself has to
say — the concurrency group, the cache keys, `--affected` on pull requests, job
parallelism — is written in A1, up front, for the same reason.

The residual cost is honest: if the workflow *does* need changing later, that
change is another staged file and another handover. §3.2 records
`.github/workflows/ci.yml` as owned by nobody after A1 for exactly this reason.

---

## 3. The file partition

A merge conflict here costs a resolve, a re-run and possibly a re-review. The
partition is designed so it does not happen, not so it is cheap when it does.

### 3.1 The rule

**After WP-A2, no work package edits a root-level file.** Every WP owns
`packages/<name>/src/<specific files>` or `apps/<app>/src/<area>` and nothing
else. The exceptions are enumerated below and each is a WP of its own that
lands alone.

This is what WP-A2 and WP-A5 buy: the complete manifest declaring all 37
packages and the app up front, and one mechanical PR materialising every
skeleton from it. No later PR creates a `package.json`, and no two branches
race to add one.

### 3.2 Conflict-magnet register

| File | Owner | Rule |
|---|---|---|
| `package.json` (root: workspaces + catalog) | WP-A1, then catalog PRs C1–C4 | A dependency addition is its own PR, landed before the wave that needs it. Never bumped from a feature branch. |
| `bun.lock` | same | Follows the catalog PR. Regenerate after rebase, never hand-merge. |
| `turbo.json` | WP-A1, then WP-Z2 | Task graph lands complete at A1. One late tuning PR. |
| `ci/workflows/ci.yml` | WP-A1 only | Staged, then handed over (§2.6). |
| `vercel.json` | WP-R11, plus one line from WP-N8 for the cron entry | Lands with the deploy; N8 appends its cron schedule. |
 | `.github/workflows/ci.yml` | **nobody, after the handover** | Changing it means another staged file and another handover, so it is written complete once and the gates register themselves in `scripts/gates.ts` instead. |
| `scripts/gates.ts` | WP-A1, then one line per gate | Each gate script appends its own registration. Appends collide rarely and take both sides. |
| `biome.json` | WP-A1 | Never edited again. A rule that needs disabling gets a decision file first. |
| `bunfig.toml` | WP-A1 | `minimumReleaseAge` and the per-package `preload` blocks, all at once. |
| `scripts/packages.manifest.ts` | WP-A2, then **M-PRs** | Widening a package's exports is an M-PR: manifest edit + `fix:api-surface` + nothing else. Serialized: at most one open at a time. |
| `AGENTS.md`, `docs/guidelines/*.md` | WP-A5, then the port script | Generated by the port. **Never hand-edited** — gate 10 fails on a changed sha256. A deviation goes in `docs/guidelines/local/`, a new file nothing else touches. A re-port or refresh is its own PR. |
| `packages/<name>/docs/AGENTS.md` | that package's first WP | One addendum per package, so no two branches share one. |
| `docs/DECISIONS.md` | generated | Regenerate after rebase. |
| `packages/prompt/src/versions.ts` | WP-J1, then each prompt WP | Each prompt WP appends **one line**. Ordered alphabetically so appends do not collide; if two do, take both. |
| `packages/config/src/tiers.ts` | WP-L3, then Spike A's follow-up | One owner at a time. |
| `packages/core/src/*` | one file per WP | `core` is split by domain area in the manifest's exports so B5–B7 never touch the same file. |
| `packages/copy/src/*` | one file per screen | Same reason. Screen WPs each own their own copy module. |

### 3.3 What runs in parallel

Stated per wave below. The short version: wave A is strictly serial; waves B
(foundation), S (spikes), and P/Q (design system) run concurrently with
everything; the chain `db → migrations → stores → server` is serial; `text →
prosody → style-card → pipeline` is serial; `corpus-gutenberg` is serial after
its spike and `text`.

---

## 4. The spikes, and the fact that this session cannot run them

Three pieces of evidence gate real decisions. **None of the three can be
gathered from the build session**, which changes their shape rather than their
purpose.

The build session's egress proxy denies `gutendex.com`, `www.gutenberg.org` and
`api.router.com` by organization policy, and no `RAMP_ROUTER_API_KEY` is
present. Package registries are allowed, so everything else builds and tests
normally. Verified at planning time:

```
gutendex.com:443        connect_rejected (policy)
www.gutenberg.org:443   connect_rejected (policy)
api.router.com:443      connect_rejected (policy)
registry.npmjs.org      allowed
```

Two things the environment *does* have, both verified at planning time and both
load-bearing: **Postgres 16**, so `test-db` runs a real server and every store,
migration and route test runs locally without Neon; and **cross-connection
`LISTEN`/`NOTIFY` through `pg`**, which is §5.3's streaming mechanism.

So each spike splits in two: **an offline half built now, designed so a wrong
guess fails loudly rather than silently**, and **a live half deferred to
WP-X0's single verification pass** (§5.4), which you run with a key and open
egress and which reports every declared-versus-measured discrepancy at once.

The rule that makes this safe: **nothing built offline may hardcode a value the
live half is supposed to establish.** Every such value is a row in a table
marked `source: "declared"`, read at run time, and the verification pass
rewrites the table and fails on any row that moved. A guess that turns out
wrong is then a red build with the right number in the diff, not a subtly wrong
product.

### S1 — Router capabilities

Gates every model stage: waves D, J, K, L.

**Offline half, built now.** `packages/provider-router/src/models.ts` carries
the catalogue with `structuredOutput`, `maxOutputTokens` and `pricing` per row,
every one tagged `source: "declared"` and sourced from published documentation
rather than measurement. SSE fixtures are synthesised against the OpenAI
Responses event grammar, not recorded, and the fixture file says so in its first
line. Tier resolution (WP-L2) reads the table rather than assuming anything, so
a corrected row changes behaviour with no code edit. A unit test asserts **no
row is tagged `measured` yet** — which is what stops the declared table from
being quietly mistaken for a verified one.

**Live half, deferred to WP-X0.** `scripts/probe-router-responses.ts` (nexus's,
extended) records, per catalogue model:

- whether `text.format: { type: "json_schema", strict: true }` is accepted and
  produces a conforming object, tested with one real nested schema (a cut-down
  `ClarifyResult`, which is the hardest of auteur's six typed stages: an array
  of objects with a nested string array);
- the real `maxOutputTokens`, established by asking for more than the declared
  ceiling and reading the truncation, not by trusting a docs page;
- declared list price per million input and output tokens, and the cached-input
  rate where one exists;
- recorded SSE transcripts as fixtures, so every later test in wave D is
  offline.

**Proof of the live half:** every catalogue row re-tagged `source: "measured"`,
`docs/spikes/router-capabilities.md` written with a row per model, and the
recorded fixtures replacing the synthesised ones. **The pass fails if any
declared value differs from the measured one**, printing both — so a wrong guess
surfaces as a diff rather than as behaviour.

**Proof of the offline half, now:** the fixtures replay with zero network; the
`no-measured-rows-yet` test passes; and `check-router-catalogue.ts` runs and
reports "unverified" rather than "clean".

**The branch this decides, and the default taken until it does.** Six of the
seven model stages are typed. The table ships with the **conservative
assumption** — `corpus-select` and `critique` at `balanced`, not `cheap` — so
the pipeline is correct if the pessimistic case is true and merely more
expensive than necessary if it is not. WP-X0 moves them down if the measurement
allows it. Concretely, if no `cheap`-tier candidate accepts strict schemas:

- `corpus-select` and `critique` move to `balanced` — `ARCHITECTURE.md` §6.4 is
  explicit that the answer is not a JSON-repair loop.
- The §10 cost target is re-baselined from measurement in WP-X1 rather than
  asserted. `PRD.md`'s $0.15 median becomes a number to report against, and if
  it is missed the report says by how much and which stage spent it.
- Recorded as decision `0002`, written by this WP whichever way it goes.

`draft` is the one untyped stage; nothing about it depends on this outcome.

### S2 — gutendex response

Gates wave I.

**Offline half, built now.** The zod schema is written from `ARCHITECTURE.md`
§5.2's field names — the same public-documentation source, so no new guessing —
and the fixture beside it is **synthetic and labelled synthetic in its filename**
(`gutendex-search.synthetic.json`). Two properties make a wrong guess loud
rather than silent, which is the whole reason `ARCHITECTURE.md` invariant 4
exists: the schema rejects unknown keys rather than ignoring them, and every
field the provider actually reads is required rather than optional. A live
response shaped differently therefore throws on the first search naming the
field, instead of yielding `undefined` and a card built from nothing.

**Live half, deferred to WP-X0.** Record one real
`GET https://gutendex.com/books?search=…&languages=en`, one real book detail,
and one plain-text fetch header set; replace the synthetic fixtures; write
`docs/spikes/gutendex-schema.md` as a field-by-field diff against §5.2.

**Proof of the live half:** the schema parses the real response unchanged, or
the diff names every field that moved. Any correction that changes the author-id
shape is a decision file, because it changes the card cache's identity.

**Proof of the offline half, now:** the schema parses the synthetic fixture;
adding an unknown key to a copy fails; removing any required field fails naming
that field.

### S3 — Latinate validation set

Gates WP-F5, and through it the report's measure count.

This one cannot be faked at all. A validation set drawn from a corpus this
session cannot fetch would be a list of words I wrote down, and measuring a
classifier against a set assembled to match it is the exact failure
`ARCHITECTURE.md` §4.3 built the gate to prevent.

**So the measure ships scored, and carries its own provenance.** The honesty is
not in withholding the verdict — it is in never showing one without saying what
produced it. Every `FitMeasure` the classifier produces carries
`classifier: { kind: "suffix-proxy", validated: false }`, and the UI renders
`latinate ratio (suffix proxy, unvalidated)`. When the validation set exists,
`validated` becomes true and the qualifier becomes the measured precision. If
precision comes back below 0.85, the measure is demoted out of the report
entirely — one line, because the scored set reads the exported gate result
rather than a literal.

**Offline half, built now.** The classifier, its suffix and exception lists,
`scripts/draw-word-types.ts` (draws ~500 word *types* by frequency from a
cleaned corpus), and the precision harness that will score it. `latinateRatio`
is scored, so the report ships with **five** measures, and the fifth is the only
one whose `FitMeasure` carries a `classifier` block.

**Live half, deferred to WP-X0.** Fetch a real corpus, run the draw script,
hand-label the 500 types, and run the harness. The fixture carries a comment
stating that the labels are hand-applied and that a suffix list tuned against
them is a fit to 500 labels.

**The branch this decides** (`ARCHITECTURE.md` §4.3): precision ≥ 0.85 fills in
`precision`, flips `validated` to true, and the measure stays; below 0.85 it is
demoted to a draft-prompt hint and the report drops to four. Written as decision
`0003` with the measured precision and recall in it.

**Why this is defensible when withholding the measure would also have been.**
The risk of scoring an unvalidated proxy is that a reader takes a `drift`
verdict for a fact about the prose when it may be a fact about the suffix list.
That risk is addressed by the `classifier` block rather than by silence: the
verdict is never rendered without `(suffix proxy, unvalidated)` beside it, which
is more information than a missing measure gives. `ARCHITECTURE.md` §4.3 already
required the proxy to be labelled wherever it appears; this makes the label
carry the validation state too.

**Proof of the offline half, now:** the harness scores the classifier against a
small hand-checked sample committed as `latinate-sample.json` and **prints**
precision and recall without gating on them; a test asserts that every
`FitMeasure` for `latinateRatio` carries `validated: false` and no `precision`,
and that **no other measure carries a `classifier` block at all** — the five
counts must not acquire a hedge they do not need.

---

## 5. Two open items, and the hosting boundary

### 5.1 Prompt contents

`packages/prompt` is pure, exports one module per model stage, and every export
carries a version constant. `extractionPromptVersion` is in the card's
`buildKey`, so editing `style-extract`'s prompt bumps every card it built.

**Shape.** One file per stage, `src/<stage>.ts`, each exporting
`{ id, version, build(input): string }`. `version` is `"<stage>@<n>"`, asserted
against `/^[a-z-]+@\d+$/` and re-exported from `src/versions.ts` so the pipeline
reads versions without importing eight modules. `build` is a pure function of
its typed input — no clock, no env, no I/O — which is what makes the snapshot
tests meaningful.

**Contents, proposed.** Every prompt states: what it is given, what it must
return (the schema restated in prose, because a schema alone does not say what
a good value looks like), and its named clauses. The named clauses are the part
that is a test:

| Prompt | Given | Returns | Named clauses, each asserted present |
|---|---|---|---|
| `corpus-select@1` | Titles, years, word counts, first passage per work. Never full texts. | ≤12 work ids, one-line reason each | **spread**: sample across career period and across form; **translator**: prefer one translator where the choice exists; **reason**: the reason is shown to the user as a stage detail line, so it names the work and the criterion |
| `style-extract@1` | The resolved card skeleton, ~40 candidate passages with ids, the measured `ProsodyBlock` | The qualitative half, every field a `Claim` | **cite**: a field you cannot point at a passage for is returned without a citation, never with an invented one; **no-prosody**: the measured block is given as evidence and must not be restated as a claim |
| `clarify@1` | Idea, constraints, preset, resolved card, answers so far, round number | `ClarifyResult` | **purpose**: every question states the decision it resolves and why the answers so far did not settle it; **from-the-card**: a question that would be asked of any author is not asked; **suggestions**: 2–4 concrete options, never "it depends" |
| `outline@1` | Idea, constraints, preset, resolved card, all answers incl. skips | Beat sheet + the choices the answers did not determine | **not-asked**: return every choice you made that no question covered, for the decisions log; **shape**: beat count follows the preset's word target |
| `draft@1` | Resolved card, outline, answers, exemplars, preset, continuity context under `sequential-scene` | Prose. **The one untyped stage** | **precedence** (`ARCHITECTURE.md` §4.6): the targets describe a corpus, not a quota; where hitting one would cost the story its coherence at this length, the story wins and the drift will be reported; **anti-patterns**: the card's `antiPatterns` are prohibitions, not suggestions; **no-label**: do not write the provenance label — `export` owns it |
| `critique@1` | Resolved card, `FitMeasure[]`, the draft | `Finding[]` | **number**: every finding states a number and its consequence; a finding without a digit is dropped by the engine, so one without a number is a wasted finding; **path**: cite a path that exists in the card or the measures |
| `revise@1` | Findings with `status !== "pass"` and their remedies, or a marked span plus 300 words either side | `{ markdown, applied[] }` | **targeted**: revise against these measures, not "improve the style"; **span**: under the selection path, replace only the marked span |
| `summarize-beat@1` | The beats so far | Plain text. Untyped deliberately — a summary is prose, and typing it would put a strict-schema requirement on the cheap tier for no gain | **carry**: names, facts and unresolved threads a later beat needs |

**Proof (WP-J1 and each prompt WP):** a snapshot per prompt; a test per named
clause asserting the clause's sentinel phrase is present; a test that `build`
is pure (same input twice → identical string, and the module imports nothing
outside `@auteur/core`); a test that every export's version matches the pattern
and appears in `versions.ts`.

### 5.2 Tier candidates and the stage-to-tier assignment

**Candidate lists are provisional until S1.** The catalogue in the wizard
handoff is sample data and says so. These lists are the starting point WP-L3
lands; Spike A's follow-up PR replaces them with what the gateway actually
offers and what it can actually do.

```
cheap:    gpt-5-mini · qwen3-30b-a3b · deepseek-v3.2 · glm-4.6-air
balanced: claude-haiku-4.5 · gpt-5 · kimi-k2-0905 · deepseek-v3.2
strong:   claude-sonnet-4.5 · gpt-5 · claude-opus-4.1 · grok-4
```

Ordering rule, and it is the whole of the resolution logic: **take the first
candidate the catalogue contains that also meets the stage's requirements** —
strict structured output when the stage has an `outputSchema`, and sufficient
`maxOutputTokens` when the stage is `draft` under `single-call`. The lists are
ordered by expected capability-per-cost, and cheapness falls out of asking for
less rather than being the criterion (`ARCHITECTURE.md` §6.3). Models believed
to support strict schemas lead the `cheap` and `balanced` lists deliberately:
six of seven stages are typed, so a list ordered any other way resolves to a
model that cannot run them.

**Stage-to-tier, proposed** — `ARCHITECTURE.md` §6.2's table unchanged, carried
as the hypothesis it is:

| Stage | Tier | If a mistake here happens |
|---|---|---|
| `corpus-select` | cheap | Two odd works out of twelve; the spread is visible in `perWork` |
| `style-extract` | balanced | The card is wrong, and everything downstream inherits it |
| `clarify` | balanced | A generic question; the user skips it |
| `outline` | balanced | A weak beat sheet; the user regenerates |
| `draft` | strong | The session |
| `critique` | cheap | One missed finding; one revision pass |
| `revise` | strong | A worse draft than the one it replaced |

`style-extract` at `balanced` rather than `strong` is the assignment worth
doubting — it is the one stage whose output is cached and reused across
sessions, so its mistakes are the longest-lived. It stays at `balanced` because
`config/tiers.ts` is data and WP-X1 measures the alternative for the price of a
config edit, which is the experiment `ARCHITECTURE.md` §6.3 asks for.

### 5.3 The topology: Vercel and Neon, one function per stage

**Two platforms. `apps/auteur-web` on Vercel — the client as a static build and
all fourteen routes as functions — and Postgres on Neon. No machine.**

#### What a "pipeline run" is

`ARCHITECTURE.md` §6.2's stage graph, executed once. `POST /advance` says which
step the session should reach; the engine runs the stages between here and there
that are stale (§7.5), in order, streaming events as it goes:

```
corpus-select    cheap      one model call — which twelve works, and why
work-fetch       —          twelve HTTP fetches to Project Gutenberg, cleaned
prosody-compute  —          the deterministic metrics over ~200k words
style-extract    balanced   one model call over ~40 passages — the card
clarify          balanced   one call per round, up to three rounds
outline          balanced   one model call — the beat sheet
draft            strong     one call, or one per beat under sequential-scene
critique         cheap      one model call over the finished draft
revise           strong     one model call
style-fit        —          the deterministic report
```

#### Why that is not a long-running service

An earlier draft of this plan put the pipeline on a Fly machine, arguing from
the run's total duration — four minutes for a flash story, tens of minutes for a
novelette at roughly ninety calls. **That argument was wrong, and it is worth
saying why, because the same mistake is easy to repeat.** It reasoned from the
duration of the *sequence* when the unit of execution is the *stage*. Every
stage is individually bounded:

| Stage | Bounded by | Rough |
|---|---|---|
| `corpus-select`, `clarify`, `critique` | one model call | 10–40s |
| `work-fetch` | twelve fetches at four concurrent | 30–90s |
| `prosody-compute`, `style-fit` | pure CPU | seconds |
| `style-extract`, `outline`, `revise` | one model call | 30–120s |
| `draft` | one call under `single-call`; **one per beat** under `sequential-scene` | minutes at most |

And nothing carries in memory between them. A stage reads from `artifacts` and
the session row, writes back, appends events — which was already true, because
it is what §7.5's `input_key` staleness is computed over. So **one function
invocation per stage** costs no design change at all.

`draft` is the only stage that could exceed a function ceiling, and §6.6 already
selects `sequential-scene` for anything long. The plan adds one clause to that
selection: switch on the estimated single-call duration as well as on
`maxOutputTokens`, so the strategy follows the platform rather than colliding
with it.

#### The three mechanisms this needs

- **A durable chain.** `stage_queue`. A stage's last act inside its transaction
  is to enqueue the next; it then asks Vercel to invoke it and returns. A lost
  invocation leaves a queued row, and a one-minute cron sweep re-invokes it.
  Claiming is a conditional update, so a sweep racing a live invocation cannot
  run a stage twice.
- **Push without a broker.** §7.3's ordering rule already says every event is
  written to `events` *before* being pushed, so the table is the source of truth
  and the in-memory broker was only a latency optimisation. `GET /events` is a
  streaming function that replays from the cursor and then waits on Postgres
  `LISTEN`; the stage function `NOTIFY`s after each append.
- **Cancellation as a flag.** `POST /cancel` sets
  `session_runs.cancel_requested`; the running stage checks it between delta
  flushes. Worst-case latency is one flush.

#### What it costs, paid explicitly

- **Deltas are batched, not per token** — a flush every ~250ms or at a paragraph
  boundary, whichever comes first. One row per flush rather than one per token.
  The caret advances in small chunks rather than per character; §6.7's live
  drift is already per-paragraph and is unaffected.
- **An SSE connection ends at the function's ceiling, routinely.** §7.3's
  failure table already specifies reconnect-from-cursor and `stream-client`
  already de-duplicates by `seq` — but this path is now the common case rather
  than the exceptional one, so WP-M3 tests it as such.
- **Cold starts add latency between stages**, which lands directly on §10's
  four-minute time-to-draft target. WP-X1 measures it; if it dominates, the fix
  is Vercel's fluid compute rather than a machine.
- **`LISTEN` needs a direct, unpooled connection**, held for the life of each
  open stream. The mechanism is verified: on Postgres 16 with `pg`, a
  `pg_notify` committed on one connection arrives on another `LISTEN`ing
  connection with its JSON payload intact. **What is not verified is Neon
  specifically** — their pooled endpoint will not support it and their direct
  endpoint is ordinary Postgres, so this is expected to work, and WP-X0 confirms
  it. If it does not, the fallback is polling `events` on the cursor every
  300ms, which costs latency and no architecture.

#### What it buys

One platform fewer, no Dockerfile, no machine to operate, no signed
service-to-service seam, no second origin in the client and therefore no CORS.
`api-contract` describes one deploy unit again.

### 5.4 What I need from you, and when — the whole list

Nothing in this list blocks a work package. Every item is deferred to the end
and gathered into **one verification pass, WP-X0**, so there is a single sitting
where you supply credentials, run one command, read one report, and give
feedback.

| # | What | Needed for | Until then |
|---|---|---|---|
| 1 | Move `ci/workflows/ci.yml` to `.github/workflows/` (§2.6) | CI running at all | PRs land with gates verified locally; CI results appear retroactively once the file is live. **This does not block the next PR.** |
| 2 | `RAMP_ROUTER_API_KEY`, and egress to `api.router.com` | S1's live half, K5, W2, X1 | The catalogue table ships `source: "declared"` and the pipeline runs against a scripted provider |
| 3 | Egress to `gutendex.com` and `www.gutenberg.org` | S2's live half, S3, I3's real fetches, X1 | Synthetic fixtures, labelled synthetic, with schemas that reject rather than ignore |
| 4 | A Neon project and its two connection strings, pooled and direct | The deploy only | **Not blocking for development.** Verified at planning time: Postgres 16 is installed in the build environment and `test-db` runs a real server against it, including cross-connection `LISTEN`/`NOTIFY` with `pg`. Every store, migration and route test runs locally |
| 5 | A Vercel account | R11 | The client and the routes run locally against the same Neon branch |
| 6 | Values for `AUTEUR_API_TOKEN` and `AUTEUR_STAGE_SECRET` | R11 | Only read when deployed |

**Feedback you give at WP-X0, not before.** The verification pass prints one
report: every declared-versus-measured discrepancy in the catalogue, the
gutendex schema diff, the latinate precision number and whether it promotes the
measure, and the five `PRD.md` §10 measures from one real end-to-end story. That
report is the thing to react to. Anything it reveals is fixed in follow-up PRs
against the same plan.

**Nothing else asks for your input.** §9 is no longer a list of halt conditions;
it is a list of what was decided in advance so that it would not have to be.

---

## 6. Work packages

Legend: **Deps** are WP ids. **[mech]** = mechanical, no review round.
**[net]** = needs network. **[key]** = needs a real Ramp Router key.
**[handover]** = ends by handing a file to you; does not block the next WP (§2.6).
**[optional]** = the plan is complete without it; see §5.3.
Every Proof names a test or a gate.

### Wave A — CI, then the conflict magnets. Strictly serial.

**A1 is the first change in the repository and it ends in a handover (§2.6).**
It does not wait for you: A2 opens immediately, and CI starts reporting whenever
you move the file. A0 is in a different repository and can be worked from the
start; it blocks only A4.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **A0** | **In `ac-zeitgeist/agent-guidelines`**, not auteur: `profiles/local-app.md` per §1.2 | `profiles/local-app.md`, plus the profile's row in that repo's `README.md` and `meta/PORTING.md` tables | That repository's own `bun run validate` and `bun run test` — the validator is what rejects an unbound variable, an omitted `requires`, and an `include` a bundle already provides. Then a scratch port writes 25 guideline files and an index naming all 25 | — |
| **A1** **[handover]** | **CI, and the toolchain it needs to run.** The complete workflow — eleven gate jobs, concurrency group keyed on the ref, turbo cache restored on the lockfile hash, `--concurrency=100%`, `--affected` on pull requests, independent jobs in parallel — written to the **staging path** `ci/workflows/ci.yml`, never to `.github/`. Plus `docs/CI-HANDOVER.md`, `scripts/gates.ts` (§2.6's indirection), and the root toolchain: bun workspaces, the complete catalog, `turbo.json`, `biome.json`, `bunfig.toml` (`minimumReleaseAge = 604800`), base `tsconfig`, `packages/tsconfig`, `packages/biome-config` | `ci/workflows/ci.yml`, `docs/CI-HANDOVER.md`, `scripts/gates.ts`, `/package.json`, `/bun.lock`, `/turbo.json`, `/biome.json`, `/bunfig.toml`, `/tsconfig.json`, `/.gitignore`, `/.nvmrc`, `packages/tsconfig/**`, `packages/biome-config/**` | `bun install --frozen-lockfile`, `biome check` and `tsc --noEmit` green locally, and `bun run gates` exiting zero. A green Actions run is the confirmation and arrives when you activate the file; it is not a precondition for A2 | — |
| **A2** | `scripts/packages.manifest.ts`: all 37 packages and the one app from `ARCHITECTURE.md` §1 plus the four named below, with layer, `workspaceDeps`, subpath `exports`, coverage floors. `core` and `copy` split into per-area subpaths so §3.2's partition holds | `scripts/packages.manifest.ts`, `scripts/packages.manifest.test.ts` | A test asserting every package named in `ARCHITECTURE.md` §1's table is present, that `LAYERS` matches §1's order, and that `component-library`'s `workspaceDeps` are exactly `tokens, icons, copy, formatting, core` | A1 |
| **A3** | Gate scripts ported from nexus: `check-dependencies`, `api-surface`, `new-package`, `package-tests`, `check-catalog`, `check-bun-version`, `preflight`, `gate-self-test`; plus `check-min-age` (argo's `dependency-min-age`, as `packages/dependency-min-age`) and `check-guidelines`. Each registers itself in `scripts/gates.ts` rather than in the workflow | `scripts/*.ts` except the manifest, `packages/dependency-min-age/**` | `bun run gate-self-test` green, with a case per gate 4, 5, 6, 9, 10: a cycle, a layer violation, a `component-library` import past its five, a widened export with no manifest edit, a drifted skeleton, an under-age dependency, an edited seeded guideline. The same run in CI, on the job A1 already created, with no workflow edit | A2 |
| **A4** | The port run per §1.1: `AGENTS.md`, `CLAUDE.md`, 25 files under `docs/guidelines/`, `docs/guidelines/local/README.md`, `docs/templates/package-AGENTS.md`, `.agent-guidelines.lock`. Plus the five `local/*.md` documents of §1.5, `docs/decisions/0001-document-index-regime.md`, and the `decisions:index` script | `/AGENTS.md`, `/CLAUDE.md`, `/.agent-guidelines.lock`, `docs/guidelines/**`, `docs/templates/**`, `docs/decisions/**`, `scripts/decisions-index.ts` | Gate 10's five assertions (§1.8), each with a `gate-self-test.ts` case: a byte changed in a ported file, an id deleted from the index, a `local` doc overriding an unported id, an addendum promoting an `always` document | A3, A0 |
| **A5** **[mech]** | Every package and app skeleton materialised from the manifest: `package.json`, `tsconfig.json`, `bunfig.toml`, `README.md`. No `src/`. A package with no `src/` is *declared, not materialised*; gates 3 and 4 skip it | `packages/*/package.json`, `packages/*/tsconfig.json`, `packages/*/README.md`, `apps/*/…` | Gate 6 (`new-package.ts --check`) passes on a clean tree; deleting one generated line fails it | A3 |

The four packages A2 adds to `ARCHITECTURE.md` §1's list: `dependency-min-age`
(argo's, gate 9); `config` (foundation, holding `tiers.ts` — §6.3 calls it
`config/tiers.ts` and treats it as data rather than engine, which makes it a
package rather than a file inside `pipeline`); `test-db` (the ephemeral-Postgres
harness §3's resolution to Neon requires, taken from nexus); and `stage-queue`
(store layer, the durable chain of §5.3, kept out of `pipeline` so the engine
stays a pure function of one stage). All four are recorded as decisions.

### Wave S — the spikes' offline halves. Start at A5; do not wait for wave B.

Their live halves are WP-X0 (§4, §5.4). Nothing here needs network.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **S1** | §4/S1's **offline half**: the declared catalogue table, synthesised SSE fixtures, and `scripts/probe-router-responses.ts` ready to run but unrun | `scripts/probe-router-responses.ts`, `packages/provider-router/tests/fixtures/**` | §4/S1's offline proof: fixtures replay with zero network; the `no-measured-rows-yet` test passes | A5 |
| **S2** | §4/S2's **offline half**: the zod schema from `ARCHITECTURE.md` §5.2's field names, rejecting unknown keys, and a fixture named `*.synthetic.json` | `scripts/probe-gutendex.ts`, `packages/corpus-gutenberg/tests/fixtures/**` | §4/S2's offline proof: the schema parses the synthetic fixture; an unknown key fails; a missing required field fails naming it | A5 |
| **S3** | §4/S3's **offline half**: the classifier, the draw script, the precision harness, and the unvalidated-but-scored default | `scripts/draw-word-types.ts`, `packages/prosody/tests/fixtures/latinate-sample.json` | §4/S3's offline proof: the harness prints precision and recall; every `latinateRatio` measure carries `validated: false` | A5 |

### Wave B — foundation. Fully parallel after A5.

Twelve independent branches; none shares a file with another.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **B1** | `ids` — UUIDv7 and the branded id types | `packages/ids/src/**` | Property test: 1,000 minted ids sort lexicographically in mint order, and each carries version nibble 7 and variant `10` | A5 |
| **B2** | `errors` — `AuteurError`, `ARCHITECTURE.md` §7.4's closed taxonomy, `toHttpResponse` | `packages/errors/src/**` | A table test mapping every `ErrorCode` to exactly one status; a test that `toHttpResponse` on a non-`AuteurError` returns 500 with a fixed message and **does not** include the thrown message | A5 |
| **B3** | `env` — one schema, deferred-then-memoized parse | `packages/env/src/**`, `/.env.example` | A test that `.env.example` names exactly the schema's keys; a missing required var fails naming that var | A5 |
| **B4** | `logger` — structured JSON, key-based redaction | `packages/logger/src/**` | A record containing `apiKey`, `authorization` and `RAMP_ROUTER_API_KEY` emits `[redacted]` for each, at any nesting depth | A5 |
| **B5** | `core/session` — session, step, preset, question, decision-entry types and schemas | `packages/core/src/session.ts` + test | Round-trip per schema; a `Question` with an empty `decision` fails parse | A5 |
| **B6** | `core/style-card` — `Claim`, `Origin`, `StyleCard`, `CardOverlay`, `AuthorRef`, `WorkRef` | `packages/core/src/style-card.ts` + test | A `Claim` with `origin: "derived"` and no `citation` fails parse; `prosody` is typed as a bare `ProsodyBlock` and a type-level test asserts there is no `Claim<ProsodyBlock>` shape it accepts | A5 |
| **B7** | `core/prosody` + `core/fit` — `ProsodyBlock`, `DialogueMarker`, `ProsodyTarget`, `FitMeasure`, `Finding`, `StyleFitReport` | `packages/core/src/prosody.ts`, `src/fit.ts` + tests | Round-trip; `FitMeasure.status` union is exactly the four values `ProsodyStat`'s `.d.ts` declares | A5 |
| **B8** | `core/pipeline` + `core/events` — `Stage`, `Tier`, `Role`, `Pipeline`, the `SessionEvent` union | `packages/core/src/pipeline.ts`, `src/events.ts` + tests | Exhaustiveness test: a `switch` over `SessionEvent["type"]` with no default compiles, and adding a member breaks it | A5 |
| **B9** | `formatting` — `relativeTime`, `pluralize`, `metaRow`, `elapsed`, `prosodyValue`, `money` | `packages/formatting/src/**` | Table per function. `prosodyValue` never emits a trailing zero; `money` always emits two decimals; property: `elapsed` is monotone in its input | A5 |
| **B10** | `test-support` — happy-dom preload, styled `render`, axe audit, provider conformance suite | `packages/test-support/src/**` | Self-test: the preload runs before a DOM import; the axe audit fails on a fixture with an unlabelled input; the conformance suite fails against a provider that drops a delta | A5 |
| **B11** | `test-support/scripted-provider` — the scripted fake provider the pipeline is tested against | `packages/test-support/src/scripted-provider.ts` + test | Replays a scripted turn including a mid-stream error, a cancellation and a truncation, and asserts the emitted delta sequence exactly | B10 |
| **B12** | `copy` — module-per-screen layout, the barrel, and the content rules as tests | `packages/copy/src/index.ts`, `src/rules.test.ts`, `src/shell.ts` | The rule tests enumerate the barrel and fail on: an emoji, an exclamation mark outside the named punctuation-table exemption, a terminal period on a label, an in-app "we"/"I"/"Let's", a banned word (`AI-powered`, `magic`, `effortless`, `seamless`, `unleash`, `craft` as a verb, `in seconds`, `just`), and `Analyzing…` | A5 |

### Wave C — catalog PRs. Each lands alone, ahead of the wave it serves.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **C1** **[mech]** | `zod`, `fast-check` in the catalog | `/package.json`, `/bun.lock` | Gate 9 passes; `bun install --frozen-lockfile` clean | A1 |
| **C2** **[mech]** | `openai` in the catalog | same | same | A1 |
| **C3** **[mech]** | `@pandacss/dev`, `postcss`, `@base-ui-components/react`, `lucide-static` | same | same | A1 |
| **C4** **[mech]** | `hono`, `vite`, `react`, `react-dom`, `@axe-core/*` | same | same | A1 |
| **C5** **[mech]** | `pg`, `@types/pg` | same | same | A1 |

### Wave D — the model gateway. Serial within the wave; parallel with B, E, P.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **D1** | `model-provider`, adapted: drop `ServerToolName`, `WebSource`, the reasoning carry-back; add `maxOutputTokens`, `structuredOutput`, `pricing` to `ModelDescriptor` and `format` to `ModelRequest` | `packages/model-provider/src/**` | A type-level test that `format.strict` accepts only the literal `true`; the conformance suite from B10 compiles against the contract | B8, C2, S1 |
| **D2** | `provider-router` core: request assembly, `responses-stream.ts`, `provider-errors.ts` — verbatim from nexus | `packages/provider-router/src/responses-stream.ts`, `src/provider-errors.ts`, `src/client.ts` | S1's recorded SSE fixtures replay with zero network and produce the expected delta sequence; a gateway 429 maps to `rate_limited`, a 404 on a pinned model to `model_unavailable` | D1, S1 |
| **D3** | Structured output: the one branch in `responses-request.ts` | `packages/provider-router/src/responses-request.ts` + test | A request-assembly test asserting `text: { format: { type: "json_schema", name, schema, strict: true } }` for a stage with an `outputSchema` and its absence otherwise; plus an env-gated live round-trip script | D2 |
| **D4** | `models.ts`: the catalogue constant with the three new columns, filled from S1 | `packages/provider-router/src/models.ts` + test | Every row has `pricing.inputPerMillion > 0`, `maxOutputTokens > 0`, and a `structuredOutput` boolean that came from S1's table, not a guess; `check-router-catalogue.ts` reports zero drift when run | D2, S1 |
| **D5** | `check-router-catalogue.ts` extended to print what the gateway reports per model | `scripts/check-router-catalogue.ts` | Run on demand against the live endpoint; its output is pasted into the PR body | D4 |

### Wave E — `text`. Serial-ish; each WP owns one file, so E1–E7 can overlap once E1 lands.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **E1** | The tokenizer: a maximal run of letters, digits, apostrophes and internal hyphens, Unicode-aware, leading/trailing apostrophe stripped | `packages/text/src/tokenize.ts` | Property: word count is additive over a concatenation with a separator; table asserting `don't`, `well-known`, `'quoted'`, `word—word`, `…`, and a surrogate-pair emoji each tokenize as specified. A companion test asserting `split(/\s+/)` gives a *different* count on the same fixture, so the rule cannot be quietly relaxed | A5, C1 |
| **E2** | Gutenberg cleaning: start/end markers incl. the older `Etext` variants, transcriber's notes, licence trailer, illustration captions, chapter headings | `packages/text/src/clean.ts` | A real Gutenberg fixture cleans to prose with zero marker text remaining; a file matching no marker variant throws `corpus_unusable`, not a truncated text | E1, B2 |
| **E3** | `unwrap`: join lines within a block, keeping breaks at verse, at a terminator followed by an indented line, and inside non-prose | `packages/text/src/unwrap.ts` | Property: unwrapping preserves word count exactly. A hard-wrapped fixture reports a mean paragraph length in the hundreds after unwrapping and near ten before — both asserted, because the second number is the bug this exists to prevent | E1 |
| **E4** | Sentence segmentation with the abbreviation list as data | `packages/text/src/sentences.ts`, `src/abbreviations.ts` | Property: sentence word counts sum to the paragraph's. Table: `Mr. Smith`, `i.e.`, `3.14`, `… and then`, `?"` followed by an opener, an initial `J. L. Borges` | E1 |
| **E5** | Paragraph/block segmentation and the cut ladder from nexus's `chunking`, heading tier dropped | `packages/text/src/blocks.ts`, `src/cut.ts` | Property: every cut lands on a block boundary where one is available and never inside a surrogate pair; a 900-word window request over a text with no paragraph breaks still returns a cut | E3 |
| **E6** | Dialogue-marker detection: `double`, `single`, `guillemet`, `em-dash`, `none`, `mixed` | `packages/text/src/dialogue-marker.ts` | Table with a fixture per convention; a corpus mixing two reports `mixed`. An em-dash fixture must not report `none` — that is the silent-zero failure | E4 |
| **E7** | `snapToSentence(text, from, to)` for §6.9 | `packages/text/src/snap.ts` | A span starting mid-sentence snaps outward to the sentence start; an already-aligned span is returned unchanged; a span covering the whole text is returned unchanged | E4 |
| **E8** | Version constants: `cleanerVersion`, `segmenterVersion` | `packages/text/src/version.ts` | A test that appending an entry to `abbreviations.ts` changes `segmenterVersion` — enforced by deriving the version from a content hash of the data files, not from a hand-edited string | E2, E4 |

### Wave F — `prosody`. Parallel within the wave after F1; serial on E.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **F1** | Sentence and paragraph length statistics | `packages/prosody/src/lengths.ts` | Property: `p10 ≤ median ≤ p90`, and `stdev` is zero for a text of identical sentences; table against a hand-counted fixture | E4, E5 |
| **F2** | Punctuation rates per 1,000 words | `packages/prosody/src/punctuation.ts` | Property: rates are invariant under concatenating a text with itself | E1 |
| **F3** | Dialogue ratio, measured against the detected marker | `packages/prosody/src/dialogue.ts` | An em-dash fixture reports a non-zero ratio; a `mixed` corpus returns the marker and no ratio | E6 |
| **F4** | MATTR over a 1,000-word window, stride 100 | `packages/prosody/src/mattr.ts` | Property: MATTR is invariant under repeating a text (this is the property raw TTR fails, and the test asserts raw TTR *does* fail it on the same fixture); a text under one window returns its whole-length value flagged `insufficient-length` | E1 |
| **F5** | The latinate classifier, its suffix and exception lists, the precision harness, and the exported gate result | `packages/prosody/src/latinate.ts`, `src/latinate-lists.ts`, `src/latinate-gate.ts` | The harness **prints** precision and recall against the hand-checked sample without gating on them. The exported gate result is `scored` with `validated: false` (§4/S3), asserted by a test; a second test sets the gate to `hint-only` on a fixture and asserts `latinateRatio` disappears from T2's scored set and appears in the draft prompt's evidence — the demotion path exercised before it is ever needed | E1 |
| **F6** | `commonBigrams`: 25 most frequent adjacent pairs, dropping pairs where both are stopwords | `packages/prosody/src/bigrams.ts` | Table against a fixture; ties broken deterministically, asserted by running twice | E1 |
| **F7** | `ProsodyBlock` assembly, `perWork` aggregation, `prosodyVersion` | `packages/prosody/src/index.ts`, `src/version.ts` | A real cleaned Gutenberg work produces a full block whose numbers are asserted against hand-counts for two of the seven measures; `perWork` shares sum to 1 | F1–F6 |

### Wave G — persistence. Serial.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **G0** | `test-db`: an ephemeral Postgres per test run with the real migration runner applying the real schema, and a deterministic `seedSession` fixture | `packages/test-db/src/**` | Its own self-test: teardown runs even when a test throws; two suites in parallel do not see each other's rows | G1 |
| **G1** | `db`: `pg` connection handling with the pooled/direct distinction (`ARCHITECTURE.md` §3.1), and SQL primitives. Knows no domain | `packages/db/src/**` | A test that the direct handle can hold a transaction across statements and the pooled handle is configured not to — the property that decides which deploy unit uses which, asserted rather than commented; a lint rule failing any template-literal interpolation into SQL, with a fixture that trips it | B2, B3, C5 |
| **G2** | `migrations`: the ledger, the build step inlining SQL into `src/generated/manifest.ts` with checksums, `ensureSchema()` under `pg_advisory_lock` | `packages/migrations/src/**`, `packages/migrations/sql/0001_ledger.sql` | Five named tests: a fresh database applies every migration once; a mutated checksum aborts naming the file and applies nothing; the fast path issues exactly one query on an up-to-date database and **never takes the lock**, asserted via a query log; **twelve processes calling `ensureSchema()` at once against one empty database each apply every migration exactly once, with no deadlock and all twelve returning**; a migration that throws mid-way leaves no ledger row and no partial schema, and the next run retries it | G0 |
| **G3** | `sql/0002_schema.sql`: `ARCHITECTURE.md` §3.2's tables | `packages/migrations/sql/0002_schema.sql` + test | A snapshot over `information_schema` for every table — columns, types, nullability, defaults, constraints, indexes; **every `CHECK` constraint independently violated and rejected**, one named test each, including `sessions.step`, `answer_state`, `stage_runs.status`, `session_runs.status`, `artifacts.kind`, and the `UNIQUE (author_id, version)` and `UNIQUE (build_key)` pair | G2 |
| **G4** | `migration:new` scaffold and the expand/migrate/contract lint | `scripts/new-migration.ts`, `scripts/check-migrations.ts` | `check-migrations.ts` rejects a fixture migration that drops or renames a column in the same file that adds its replacement — the shape that breaks a rollout with two deploy units live (`ARCHITECTURE.md` §3.3); `migration:new` produces a file the checksum step accepts and that applies nothing on its own | G2 |

### Wave H — stores. Fully parallel after G3.

Every store's tests are integration tests against a real Postgres from `test-db`. There is no mocked database anywhere in `packages/` — if a test needs one, the test is wrong.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **H1** | `session-store`: sessions, answers, artifacts, `input_key` reads and writes | `packages/session-store/src/**` | An artifact written with one `input_key` reads back stale after a dependency's key changes and fresh when it does not — the two halves of §7.5 as two tests | G3, B5 |
| **H2** | `card-store`: the versioned card cache | `packages/card-store/src/**` | Inserting a card with an existing `build_key` returns the existing row and does **not** create version 4; a genuinely new key gets `max(version) + 1` for that author | G3, B6 |
| **H3** | `corpus-store`: `works` and `passages` | `packages/corpus-store/src/**` | The cache key is `(source_url, cleaner_version)`: the same url under a bumped cleaner version is a miss, under the same version a hit; deleting a work cascades its passages | G3 |
| **H5** | `stage-queue`: enqueue, claim, complete, fail, and the sweep query | `packages/stage-queue/src/**` | **Two concurrent claims on one row: exactly one succeeds** — the property N7 and N8 both depend on; a claim older than the stale threshold is returned by the sweep query and a fresh one is not; `attempt` increments on release and a row past the retry limit is returned as failed rather than released again | G3 |
| **H4** | `event-store`: the durable log, `NOTIFY` on append, and `session_runs` — the run claim and cancel flag | `packages/event-store/src/**` | **Ordering:** a test with a subscriber that records what it received asserts no delivered event is absent from the table — the append-then-fan-out rule as an assertion, not a convention. **Gaps:** 200 concurrent appends produce `seq` 1..200 with no gap and no duplicate. **Run claim:** two claims on one session — one wins, one conflicts, so a double-clicked advance cannot run the pipeline twice against one log. **Notify:** every append emits one `NOTIFY` on the session's channel, and a `LISTEN`ing connection receives it; a test asserts the notify happens **after** the row is committed, since the reverse would push an event a reconnect could not replay | G3, B8 |

### Wave I — `corpus-gutenberg`. Serial after S2 and E2.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **I1** | gutendex client and the zod schema pinned to S2's fixture | `packages/corpus-gutenberg/src/gutendex.ts`, `src/schema.ts` | The fixture parses; a copy with any single field renamed fails the parse, and the failure names the field | S2, C1 |
| **I2** | Author folding and id minting (`gutenberg:<slug>-<birthYear>`) | `packages/corpus-gutenberg/src/authors.ts` | Two authors sharing a display name and differing in birth year mint distinct ids; a changed upstream name mints a second id rather than rewriting the first; an author with no birth year mints a stable id without one | I1 |
| **I3** | Text fetch: plain-text format preference, ≤4 concurrent, one retry on 5xx/timeout at 2s then 4s, none on 4xx | `packages/corpus-gutenberg/src/fetch.ts` | Against a scripted fetch: a 500 retries exactly once then throws `corpus_unavailable`; a 404 throws immediately with no retry; a book with no plain-text format is dropped from selection rather than fetched as HTML; concurrency never exceeds 4 | I1, E2 |
| **I4** | Passage selection: 400–900 word windows on paragraph boundaries, sampled uniformly, first and last 5% excluded | `packages/corpus-gutenberg/src/passages.ts` | Deterministic: the same work yields byte-identical passages across two runs; every passage starts and ends on a block boundary; none overlaps the excluded margins; roughly forty candidates from a twelve-work corpus | E5, I3 |
| **I5** | The `CorpusProvider` seam and `AuthorResult`'s three detail-line states | `packages/corpus-gutenberg/src/provider.ts` | The three `ARCHITECTURE.md` §5.3 states are three tests over the same author at three cache states; a `secondary`-kind provider registered alongside unions into search results without changing the builder | I2, H3 |

### Wave J — `prompt`. J2–J8 fully parallel after J1.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **J1** | Package shape, `versions.ts`, the snapshot and purity harness | `packages/prompt/src/index.ts`, `src/versions.ts`, `src/harness.test.ts` | Every export's `version` matches `/^[a-z-]+@\d+$/` and appears in `versions.ts`; a module importing anything outside `@auteur/core` fails the purity test | B5–B8 |
| **J2–J8** | One prompt each: `corpus-select`, `style-extract`, `clarify`, `outline`, `draft`, `critique`, `revise`, `summarize-beat` | `packages/prompt/src/<stage>.ts` + test; one appended line in `versions.ts` | Per §5.1: a snapshot, a test per named clause asserting its sentinel phrase, and a determinism test. `draft`'s clause test asserts the §4.6 precedence sentence verbatim | J1 |

### Wave K — `style-card`. Serial.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **K1** | Card assembly from `Evidence[]` plus the measured block | `packages/style-card/src/build.ts` | The builder takes `Evidence[]` and no provider — a type-level test asserts the signature; a derived field the model returned without a citation is stored uncited rather than dropped, and `confidence` reflects it | F7, I5, B6 |
| **K2** | `resolveCard` and `overlaidPaths` | `packages/style-card/src/resolve.ts` | With a hand-built overlay, an overlaid field comes back with `origin: "edited"` and every other field unchanged; `resolveCard` is the only export returning a `StyleCard`, asserted by enumerating the module's exports | K1 |
| **K3** | `buildKey` and versioning | `packages/style-card/src/build-key.ts` | Identical inputs produce an identical key; changing any one of the seven components changes it — seven named cases; a rebuild with an unchanged key is a cache hit and not version 4 | K1, H2, J3 |
| **K4** | `confidence` and `cardStrength` | `packages/style-card/src/strength.ts` | `confidence` is exactly `citedDerivedFields / derivedFields` — a card with 12 of 14 cited returns `0.857…`; a `secondary` card returns `0` through the same expression with no branch, asserted by a test that the function contains no `provenance` check | K1 |
| **K5** | `style-extract` wired end to end: passages, structured output, a card | `packages/style-card/src/extract.ts` | Against B11's scripted provider, the full path produces a card whose every derived field carries a citation resolving to a stored passage. The **[key][net]** half — a real card for a real author written to `docs/spikes/first-card.json` — is env-gated and runs at WP-X0 | K1, D3, J3 |

### Wave L — `pipeline`. Serial, with L3 landing alone.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **L1** | Stage graph types and the default pipeline definition (`ARCHITECTURE.md` §6.2, ten stages) | `packages/pipeline/src/pipeline.ts` | `reads` forms a DAG over the ten stages — asserted by a cycle check; every stage with an `outputSchema` has a `promptTemplate` and a `tier`, and every stage with neither has both absent | B8 |
| **L2** | Tier resolution, layers 1 and 2 | `packages/pipeline/src/resolve-tier.ts` | A catalogue with no strict-schema `cheap` model makes resolution fail **at startup**, naming the tier and the stage — not at run time; a stage whose `maxOutputTokens` requirement no candidate meets fails the same way | L1, D4 |
| **L3** | `config/tiers.ts` — §5.2's candidate lists | `packages/config/src/tiers.ts` | Every listed model id exists in the catalogue constant; the first eligible candidate per tier is asserted for the seven stages | L2 |
| **L4** | Session pins, layer 3 | `packages/pipeline/src/pins.ts` | Pinning a non-strict model to `outline` is refused with the reason in the error; the same pin on `draft` is accepted; a pin for an unknown stage id is refused | L3, H1 |
| **L5** | The engine: run **one** stage given its id and the session, emit its events, return what to enqueue next. No loop — the chain is `stage_queue`'s (§5.3) | `packages/pipeline/src/engine.ts`, `src/no-io.test.ts` | Against B11's scripted provider, a full run's `SessionEvent` sequence is asserted exactly, including a stage failure and a mid-stream cancellation; `no-io.test.ts` asserts the engine imports no `fetch`, no `node:fs`, no clock beyond what it is handed | L1, H4, B11 |
| **L6** | `clarify` re-entry and the budget | `packages/pipeline/src/clarify.ts` | 3 rounds and 8 questions are constants in code with a test: a scripted provider returning five questions in round 3 is truncated to the remaining budget; a question missing `decision` fails the schema and never reaches the UI; a round-2 question whose `whyNotSettled` references no answered question is dropped | L5, J4 |
| **L7** | Draft strategy selection, on **two** ceilings: `maxOutputTokens` and the estimated single-call duration against the function ceiling (§5.3) | `packages/pipeline/src/strategy.ts` | A table over four presets × three `maxOutputTokens` values asserting the resolved strategy, with `TOKENS_PER_WORD = 1.4` and `SAFETY = 1.15` named constants; **a preset whose token budget fits but whose estimated duration does not resolves to `sequential-scene`**, which is the clause that keeps the platform and the strategy from colliding; the resolved strategy — not the preset's suggestion — is what the returned value carries | L4 |
| **L8** | `sequential-scene`: per-beat calls, the running summary, per-beat critique | `packages/pipeline/src/sequential.ts` | A four-beat run against the scripted provider makes one draft call per beat, one summary call between beats, and one critique per beat; the last 500 words of beat *n* appear verbatim in beat *n+1*'s prompt | L7, J8 |
| **L9** | Usage accounting, cost at write time, cancellation | `packages/pipeline/src/usage.ts` | Cached input tokens are priced at the cached rate and excluded from `inputTokens` — asserted with a three-way usage fixture where folding them in would over-report by more than 3×; a cancellation mid-stream writes `status: "cancelled"` with the tokens already billed recorded | L5, D4 |
| **L10** | Live drift (§6.7) and delta batching (§5.3) | `packages/pipeline/src/drift.ts`, `src/flush.ts` | A scripted draft stream emits one `drift` event per paragraph boundary and none mid-paragraph; `mattr` is absent below 1,000 words and `dialogueRatio` absent until the marker convention has appeared — the two suppressions as two named tests. Deltas flush every ~250ms **or** at a paragraph boundary, whichever is first, asserted with an injected clock: a fast stream produces time-bounded flushes and a slow one produces paragraph-bounded ones | L5, F7 |

### Wave P/Q — design system. Runs from wave B onward, touching nothing waves D–N touch.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **P1** | `tokens`: the Panda preset generated from the design CSS | `packages/tokens/src/preset.ts` | Gate 7: the test **re-reads** `docs/design/design-system/tokens/*.css` at test time and re-derives every expectation. Changing one hex digit in the CSS fails it; the test contains no transcribed literal | A5, C3 |
| **P2** | The inverted theme condition and `prefers-reduced-motion` | `packages/tokens/src/conditions.ts` | `_light` is wired as `[data-theme="light"] &` and there is no `_dark`; a test asserting a token resolves to the dark value with no attribute set. `_reducedMotion` collapses `dur-instant` through `dur-stream` to `0ms`, asserted on the generated CSS | P1 |
| **P3** | `icons`: the closed-set Lucide wrapper, sizes 14/16/20 | `packages/icons/src/**` | A test enumerating the exported set exactly; a type-level test that a name outside it does not compile; a decorative icon renders `aria-hidden`. `ARCHITECTURE.md` §2 says ten glyphs and the handoff's working set names eight (`check`, `chevron-down`, `arrow-right`, `arrow-left`, `git-branch`, `clock`, `sun`, `moon`) — this WP settles the set against the prototype and records the delta as a decision | P1, C3 |
| **Q1** | `component-library` infrastructure: Panda config extending `@auteur/tokens`, the specimen harness, axe wiring, the adherence lint from `_adherence.oxlintrc.json` | `packages/component-library/panda.config.ts`, `src/harness/**` | The lint fails a fixture component containing a hardcoded hex, px, duration or easing that has a token; the specimen harness renders and the axe audit runs in CI | P2, B10, C3 |
| **Q2** | `core`: `Button`, `Card`, `CardHeader`, `Badge`, `Icon` | `packages/component-library/src/core/**` | Props match `docs/design/design-system/components/core/*.d.ts` exactly — a type-level test importing each `.d.ts` and asserting assignability both ways; every variant rendered; the focus ring present and never suppressed; disabled at `opacity: 0.42` with `cursor: not-allowed`, matching the handoff | Q1 |
| **Q3** | `forms`: `Field`, `Input`, `Select`, `Textarea` on Base UI | `packages/component-library/src/forms/**` | Same contract test; keyboard operation and focus order for `Select`; axe clean with and without a `Field` label | Q1 |
| **Q4** | `prose`: `Markdown`, `Exemplar` | `packages/component-library/src/prose/**` | Both default to `ground="paper"` — asserted with no prop passed. **`Exemplar` has no code path mutating its `text`**: a test enumerating the module's exports and asserting no setter, plus a render test that the DOM text equals the prop byte for byte | Q1 |
| **Q5** | `pipeline`: `Thinking`, `ProsodyStat`, `ProvenanceMark`, `WizardRail` | `packages/component-library/src/pipeline/**` | **`ProsodyStat` has no paper variant** — a type-level test that `ground` is not an accepted prop; it renders the target as a hairline tick distinct from the value marker; `WizardRail` renders completed steps clickable and pending steps not; `ProvenanceMark` renders `edited` in amber with a reset affordance | Q1 |
| **Q6** | `theme`: `ThemeToggle` and the resolver ported from `wizard-handoff/theme.js` | `packages/component-library/src/theme/**` | `auto` resolves to light between 06:00 and 18:00 local and re-checks each minute (asserted with an injected clock); an explicit choice persists under `auteur.theme`; the head script runs before first paint, asserted by a test that the resolved attribute is set before the first render | Q1 |

### Wave M/N — API and the routes. Serial after H and L.

All fourteen routes are Vercel functions in `apps/auteur-web/api/`, one file each, so no two WPs share a file.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **M1** | `api-contract`: one zod object, `ARCHITECTURE.md` §7.1's fourteen routes | `packages/api-contract/src/**` | Fourteen routes enumerated from the object, asserted by count and by path; a request schema round-trips; changing a response shape breaks the client's compile (asserted in M2) | B5–B8 |
| **M2** | `api-client`: generated from the contract | `packages/api-client/src/**` | A type-level test that a route removed from the contract removes it from the client; every method's return type is the contract's response schema output | M1 |
| **M3** | `stream-client`: cursor, replay, de-duplicate, reconnect | `packages/stream-client/src/**` | Four named tests, one per §7.3 failure row: a drop reconnects from the cursor and delivers each missed event exactly once with no duplicate; a 404 is fatal at once; an unparseable frame is fatal at once rather than reconnecting into the same frame forever; `close()` is idempotent and aborts the in-flight request | M1, B8 |
| **N1** | Server skeleton, `GET /api/health`, `GET /api/models` | `apps/auteur-web/api/_app.ts`, `src/routes/health.ts`, `src/routes/models.ts` | An HTTP-level test per route; a malformed query returns 400 in the contract's error shape, never a 200 carrying an error | M1, L3, C4 |
| **N2** | Session routes: create, read, patch, delete | `apps/auteur-web/api/sessions.ts` | `GET /api/sessions/:id` after a reload returns idea, step, answers, artifacts and the three result tabs' data in one response; an unknown id is 404 | N1, H1 |
| **N3** | `GET /api/authors` — search unioned across providers | `apps/auteur-web/api/authors.ts` | The three `ARCHITECTURE.md` §5.3 detail-line states appear in the response as three distinct shapes; a provider throwing does not fail the union, and its absence is reported | N1, I5 |
| **N4** | `POST /api/sessions/:id/advance`, the staleness computation, and enqueuing the first stale stage | `apps/auteur-web/api/advance.ts`, `apps/auteur-web/api/_staleness.ts` | **Six named tests, one per §7.5 consequence**: changing an answer restales `outline` onward and not the card; changing the author restales everything after `corpus-select` and keeps the idea; changing the preset restales `outline` and `draft` and not the card; pinning a different model for `outline` restales `outline` onward; re-entering a step and changing nothing restales nothing; `advance` enqueues exactly the stale stages in graph order **and returns before any of them runs**, asserted by the response arriving with every queue row still `queued` | N2, L1 |
| **N5** | Answers and regenerate | `apps/auteur-web/api/answers.ts`, `src/routes/regenerate.ts` | Editing an answer marks every transitive descendant `invalidated` and keeps the rows; a selection above 60% of the word count is refused with `invalid_input`; a selection is snapped outward to sentence boundaries before it reaches the prompt, asserted on the prompt input | N4, L6, E7 |
| **N6** | `PUT /api/sessions/:id/pins` | `apps/auteur-web/api/pins.ts` | Writing seven pins at once (the "one model for every stage" path) is validated per stage: a non-strict model is refused for the six typed stages with the reason, and the whole write is rejected rather than partially applied | N4, L4 |
| **N7** | `POST /internal/stage` (signed): claim a `stage_queue` row, run exactly one stage, enqueue the next, invoke it | `apps/auteur-web/api/_internal/stage.ts` | An unsigned or wrongly-signed request is rejected before any row is written, asserted by the row count being unchanged; **two invocations racing one queue row — exactly one claims it and the other returns without running the stage**, which is the property the cron sweep depends on; a stage that throws leaves its row `error` with the attempt recorded, never `claimed` for ever | N4, H4, L5 |
| **N8** | The one-minute cron sweep | `apps/auteur-web/api/_cron/sweep.ts`, `vercel.json` cron entry | A row queued and never claimed is re-invoked; a row claimed longer than any stage could take is released for one retry and then fails the run, appending a `stage_error` event so a reconnecting client is told why; a healthy in-flight row is left alone — asserted, because sweeping a live stage is the failure mode this must not have | N7 |
| **N9** | `GET /api/sessions/:id/events` — replay from cursor, then `LISTEN` — and `POST /api/sessions/:id/cancel` | `apps/auteur-web/api/events.ts`, `apps/auteur-web/api/cancel.ts` | A client disconnecting mid-run and reconnecting at its cursor receives every missed event exactly once; a run completing with no client connected still persists every event; **the stream ends cleanly at the function ceiling and the client resumes with no gap and no duplicate**, which is now the common case rather than the exceptional one; the SSE route is the only one that reads the direct connection string, asserted by enumerating the routes; a cancel sets the flag and the running stage aborts within one delta flush | N7, M3 |
| **N10** | `GET /api/sessions/:id/export` | `apps/auteur-web/api/export.ts` | Returns `text/markdown` containing the `ARCHITECTURE.md` §7.6 label verbatim; there is no query parameter or code path producing a document without it | N2, U1 |

### Wave R — the web app. R2 first; R3–R9 parallel after R1.

Each screen WP owns its screen directory and its own `copy` module.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **R1** | App shell: the 236px rail, the main column, the seven-step routing, the theme script in `<head>`. **Registers gate 11** in `scripts/gates.ts` | `apps/auteur-web/src/shell/**`, `packages/copy/src/shell.ts`, one line in `scripts/gates.ts` | The rail's mono notes derive from session state in one selector and survive a reload — asserted by mounting from a serialized session; completed rows clickable, pending not; no flash of the wrong ground, asserted by the attribute being set before first render. Gate 11 green, and its `gate-self-test.ts` case — a package the manifest declares but no test imports — fails the build | Q2–Q6, M2 |
| **R2** | Draft screen — built first, because it exercises both grounds and the live measurement | `apps/auteur-web/src/screens/draft/**`, `packages/copy/src/draft.ts` | Prose renders on a paper card and the drift aside on ink, in one view; `drift` events update the aside without re-rendering the prose; the caret animation collapses to `0ms` under `prefers-reduced-motion` | R1, L10, M3 |
| **R3** | Idea screen | `.../screens/idea/**`, `packages/copy/src/idea.ts` | The Length field's hint is the **resolved** strategy, not the preset's suggestion — asserted for a `long` preset against a model whose `maxOutputTokens` would allow `single-call` | R1, L7 |
| **R4** | Author screen | `.../screens/author/**`, `packages/copy/src/author.ts` | Search debounces at 250ms and aborts on the next keystroke; the three `ARCHITECTURE.md` §5.3 detail-line states render distinctly; the `secondary` row is disabled with its reason stated | R1, N3 |
| **R5** | Research screen and the style card | `.../screens/research/**`, `packages/copy/src/research.ts` | Three `Thinking` rows including `prosody-compute` with a null tier badge; detail lines come from `stage_detail` events and are never composed in the browser — asserted by rendering from a recorded event log and diffing the text against it | R1, N7 |
| **R6** | Clarify screen | `.../screens/clarify/**`, `packages/copy/src/clarify.ts` | "Generate now" is live from the end of round 1 and jumps to `outline` client-side; every rendered question shows its why-asked line; the budget meter's spent segments equal the question count | R1, N5 |
| **R7** | Outline screen | `.../screens/outline/**`, `packages/copy/src/outline.ts` | The beat sheet renders on a paper card; the footer caption names the model and tier the draft will run on, read from resolution rather than from the tier map | R1, N4 |
| **R8** | Result screen: three tabs | `.../screens/result/**`, `packages/copy/src/result.ts` | The three tabs are three reads of one `GET /api/sessions/:id`, asserted by a single-request test; the provenance label renders on the story tab; selecting a span turns the ghost button into "Regenerate selection" | R1, N5, T2 |
| **R9** | Model overlay, including "use one model for every stage" | `.../screens/models/**`, `packages/copy/src/models.ts` | The one-model control writes seven pins in one request and surfaces a per-stage refusal with its reason rather than applying partially; "Follow tier defaults" clears every pin; the panel scrolls inside the viewport with its footer reachable | R1, N6 |
| **R10** | API-base indirection and demo mode | `apps/auteur-web/src/api-base.ts`, `src/demo/**` | With `VITE_API_BASE` unset the client renders every screen from a recorded event log — the same log R5's test uses — and issues **zero** network requests, asserted by a fetch spy; with it set, every request goes to that origin and none to a hardcoded host | R5, R8 |
| **R11** | The deploy (§5.3): `vercel.json`, the cron schedule, the bearer-token middleware, and the stage secret | `vercel.json`, `apps/auteur-web/api/_auth.ts` | A request with no bearer token gets 401 on **every** public route, asserted by enumerating `api-contract`'s fourteen rather than by a spot check; `/internal/stage` rejects a valid bearer token and accepts only the stage secret, so a browser holding the client's token cannot drive the pipeline directly; the cron entry names the sweep and no other route | R10, N10, V1 |

### Wave T/U/V — the report, the export, and gate 8.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **T1** | Bands: interquartile over sentences, or over `perWork`; `bandBasis: "range"` under four works | `packages/style-fit/src/bands.ts` | A card from three works records `bandBasis: "range"` and the report says so; a card from twelve records `"iqr"`; the two thresholds (`pass` inside, `drift` within 1.5 band widths, `fail` beyond) are one constant with a table test at each boundary | F7, B7 |
| **T2** | The scored measures and `FitMeasure[]` assembly | `packages/style-fit/src/measures.ts` | The test reads F5's exported gate result rather than hardcoding a count, so the two cannot disagree — five now, four if WP-X0 demotes, with no edit here; `latinateRatio`'s measure carries its `classifier` block and **no other measure carries one**; `commonBigrams` and `paragraphLength` are asserted absent from the scored set | T1, F5 |
| **T3** | The two-verdict path for an edited target | `packages/style-fit/src/edited.ts` | With a hand-built overlay, an edited measure appears **twice** in `FitMeasure[]`, once `edited` and once `measured`; a type-level test that there is no single-verdict return for an edited measure | T2, K2 |
| **T4** | `critique` finding validation and the `revise` handoff | `packages/style-fit/src/findings.ts` | A finding whose `text` contains no digit is dropped; a finding citing a path absent from the card and the measures is rejected; `revise` receives only findings with `status !== "pass"` | T2, J7, J8 |
| **U1** | `export`: `renderExport(story, label)` | `packages/export/src/**` | `label` is a required parameter — a type-level test that the call does not compile without it; a fixture export contains the §7.6 sentence verbatim, and the document carries the label, the author and card version, the fit summary and the decisions log | K2, T2 |
| **V1** | `provenance-suite` — gate 8 | `packages/provenance-suite/src/**` | The five §11.2 assertions, each with a negative control in `gate-self-test.ts`: a fabricated card whose `prosody` differs from the computed block fails; an uncited `derived` claim fails; **a fixture writing `card_overlays` outside the suite's own fixtures fails**; an edited measure appearing once fails; an export fixture missing the label fails | K2, T3, U1, L5 |

### Wave W/X/Z — instrumentation, the real run, and CI tuning.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **W1** | `bun run stats` — completion rate and time-to-draft from `sessions` and `stage_runs` | `scripts/stats.ts` | Against a seeded database, completion rate and median time-to-draft match hand-computed values; time-to-draft measures `corpus-select.started_at` to `draft`'s first `stage_delta`, asserted against a recorded event log | H1, L9 |
| **W2** **[key][net]** | `bun scripts/discrimination.ts` (§10.3) | `scripts/discrimination.ts` | Runs against held-out passages `corpus-select` did not choose — asserted by intersecting the held-out set with the card's `sources` and requiring it empty | K5, W1 |
| **X0** **[key][net]** | **The verification pass** (§5.4): `bun run verify:live` runs S1's, S2's and S3's live halves in one command and prints one report — every catalogue row whose declared value differs from the measured one, the gutendex schema diff, the latinate precision with its keep/demote verdict, and **whether Neon's direct endpoint supports `LISTEN`/`NOTIFY`** (§5.3 — the mechanism is verified on stock Postgres; Neon specifically is not). Rewrites the catalogue tags to `measured`, replaces the synthetic fixtures with recorded ones, and writes the three `docs/spikes/` notes | `scripts/verify-live.ts`, `docs/spikes/**`, `packages/provider-router/src/models.ts`, `packages/provider-router/tests/fixtures/**`, `packages/corpus-gutenberg/tests/fixtures/**`, `packages/prosody/tests/fixtures/latinate-validation.json` | **The pass fails on any discrepancy rather than absorbing it**, so its green run is the claim that every declared value was right. Each of the three sub-reports is separately green or names what moved. Anything it moves lands as its own follow-up PR — a catalogue correction, a schema correction, or the one-line promotion of `latinateRatio` to a scored measure | R11, V1 |
| **X1** **[key][net]** | One real end-to-end flash story, and `docs/BASELINE.md` recording all five §10 measures | `docs/BASELINE.md` | The five measures reported with their sources: style fidelity from `style-fit`, completion and time-to-draft from `stats`, cost from `SUM(stage_runs.cost_micros)`, discrimination from W2. A missed target is reported as a number and a stage, not smoothed | X0, W2 |
| **X2** | The stage-to-tier experiment §5.2 promises: `style-extract` at `strong`, `critique` at `balanced`, each measured | `docs/BASELINE.md` (appended), `packages/config/src/tiers.ts` | Two config edits, two runs, the deltas in style fidelity and cost recorded. Whatever it shows becomes a decision file | X1 |
| **Z1** | `preflight.ts` completing: every env var validated, failing fast with the missing name | `scripts/preflight.ts` | Run against an incomplete `.env`, it names the first missing variable and exits non-zero | B3, D4 |
| **Z2** | CI tuning: `--affected` on pull requests, turbo remote caching, verified `inputs`/`outputs` | `/turbo.json`, `.github/workflows/ci.yml` | A no-op PR runs zero package tasks; a one-package PR runs that package and its dependents only; a deliberately inaccurate `outputs` declaration is caught by a cache-hit test on a clean tree | A4, and every wave's tasks declared |

---

## 7. Parallelism and the sequences that cannot be compressed

**Serial spine.** `A1 →` handover `→ A2 → A3 → A5`, with `A0 → A4` alongside, then
`G1 → G2 → G3 → H* → N* → R*` and
`E* → F* → K* → L* → N*`. Nothing in wave A may overlap; each of its PRs edits
root files, and A1 additionally waits on you.

**Runs in parallel with everything, from A5 onward:**

- **The spikes S1, S2, S3.** They gate D, I and F5 respectively and each takes
  network time nothing else is waiting on. Start all three the moment A5 lands.
- **The design-system track P1–P3, Q1–Q6.** Nine PRs that touch no file waves
  D through N touch. This is the largest source of parallelism in the plan, as
  `ARCHITECTURE.md` §15 step 9 says. If there is spare capacity anywhere, it
  goes here.
- **Wave B's twelve foundation packages.** Twelve simultaneous branches.
- **Waves D (gateway) and E/F (`text`/`prosody`).** Disjoint file sets, disjoint
  dependencies.

**Parallel within their wave:** H1–H4 (four stores, one file set each), J2–J8
(eight prompts, one file each), Q2–Q6 (five component groups), R3–R9 (seven
screens), E1–E7 once E1 lands, F1–F6 once F7's shape is fixed.

**Must be serial, and why:**

1. **A1 before everything.** Its gates are this plan's enforcement mechanism and
   every later WP's Proof assumes them. Its handover (§2.6) does not block A2.
2. **A0 before A4.** The port cannot run against a profile that does not exist,
   and `meta/PORTING.md` forbids porting the nearest profile and editing the
   result. A0 is in another repository and blocks nothing else in auteur.
3. **A2 before A5 before any package's `src/`.** The manifest is what makes the
   file partition hold; materialising skeletons piecemeal reintroduces the
   `package.json` race the whole partition exists to prevent.
4. **S1 before D1.** The three new `ModelDescriptor` fields carry the declared
   table's shape, including its `source` tag. Writing the type without the tag
   and adding it later means every row is written twice.
5. **S3 before F5 before T2.** T2 reads F5's exported gate result rather than a
   literal, which is what lets WP-X0 promote the measure with a one-line change
   and no edit in T2.
6. **G3 before every store.** Changing the schema after four stores exist is
   the expensive version of the same change.
7. **L1 before L2 before L3.** Tier resolution is meaningless without the stage
   requirements it resolves against, and the candidate lists are meaningless
   without the resolver.
8. **K2 before V1.** `provenance-suite` enumerates `style-card`'s exports; it
   cannot enumerate an unwritten module.
9. **X0 before X1, and both last.** A cost and fidelity baseline measured
   against a partial pipeline, or against a declared catalogue whose prices
   were never checked, is a number that will be quoted and is not true.

**Catalog PRs C1–C4** land alone, each ahead of the wave it serves: C1 before
B, C2 before D, C3 before P, C4 before N.

---

## 8. Decisions taken here, without review

Applied as written; each is reversible and none blocks. Every one gets a
`docs/decisions/` file.

1. **Every spike splits into an offline half now and a live half at WP-X0**
   (§4), because this session's proxy denies all three hosts. Nothing built
   offline hardcodes a value the live half establishes: it is a `source:
   "declared"` row read at run time, and the verification pass fails on any row
   that moved.
2. **`latinateRatio` ships scored, carrying its own provenance** (§4/S3). Every
   verdict it produces renders as `(suffix proxy, unvalidated)` until the
   validation set measures it, which is more information than withholding the
   measure would give. Precision below 0.85 demotes it in one line, and that
   path is tested before it is needed.
3. **A1's handover does not block A2** (§2.6). CI reports retroactively when you
   activate the file; every gate is a script that runs locally in the meantime.
4. **The document-index regime, reversing `ARCHITECTURE.md` §11.1** (§1.7).
   This one is not merely recorded: the PR that lands this plan amends §11.1
   and §12's open-item row, because a merged architecture saying the opposite
   of what is built is a live contradiction, not a note.
5. **A new `local-app` profile is contributed to `agent-guidelines`** rather
   than porting `web-app` and deleting four documents (§1.2). `meta/PORTING.md`
   requires it and the profile is reusable.
6. **auteur's three adaptations are `docs/guidelines/local/*.md` with
   `overrides:` front matter**, and no seeded file is ever edited in place
   (§1.5). Gate 10's sha256 check is what enforces it. Resolving persistence to
   Neon removed two of them: `database` and `migrations` now apply verbatim.
7. **`data-boundaries` is promoted repository-wide to ALWAYS** by
   `local/invariants.md` (§1.5), rather than left to its trigger. It fires on
   nearly every diff in a product that is seven model calls and two HTTP
   clients, and re-deciding that per diff is the decision itself.
8. **A package with no `src/` is declared, not materialised**; gates 3 and 4
   skip it. This is what makes WP-A5's single skeleton PR possible, and it is a
   one-line delta from nexus's `api-surface.ts`.
9. **`docs/DECISIONS.md` is generated from `docs/decisions/`**, not hand-edited.
   An index every branch appends to is a conflict on every branch.
10. **`core` and `copy` are split into per-area subpath exports** declared in the
   manifest up front, so concurrent branches never edit the same file.
11. **`summarize-beat` is untyped** (§5.1). A summary is prose, and typing it
   would put a strict-schema requirement on the cheap tier for nothing.
12. **`revise` is typed** — six of the seven model stages are typed, `draft` is
   the exception.
13. **Provisional tier lists ship before S1 completes** (§5.2), so wave L is not
   blocked; S1's follow-up PR replaces them and owns that file alone.
14. **`style-extract` stays at `balanced`** despite being the longest-lived
   output, and WP-X2 measures the alternative rather than arguing about it.
15. **Base UI is the headless kit** for `Select`, `Textarea` and the overlay,
    as both reference repos use.
16. **Two platforms: Vercel and Neon, one function invocation per pipeline
    stage** (§5.3). An earlier draft put the pipeline on a Fly machine,
    reasoning from the run's total duration. That reasoned about the sequence
    when the unit of execution is the stage, and every stage is individually
    bounded. Nothing carries in memory between them, so the split costs no
    design change.
17. **Persistence resolves to Postgres on Neon, reversing `ARCHITECTURE.md`
    §3's `bun:sqlite`.** A function's filesystem is ephemeral and
    per-invocation. The payoff is that `db`, `migrations`, and the `database`,
    `migrations` and `deployment` guidelines all stop being adaptations and
    become ports.
18. **Push is `LISTEN`/`NOTIFY`, not a broker.** §7.3 already required every
    event to be written before being pushed, so the table was always the source
    of truth and the broker was only latency. This is the one unverified
    assumption in §5.3; the fallback is a 300ms poll on the cursor.
19. **The chain is `stage_queue` with a one-minute cron sweep**, and claiming is
    a conditional update. A lost invocation is recovered; a sweep racing a live
    stage cannot double-run it.
20. **A single shared bearer token on every route**, rather than accounts. The
    listener is public and the gateway key is behind it. No sessions, no
    schema, so `PRD.md` §4's "no accounts" and the exclusion of the `auth`
    guideline both stand.
21. **R10's demo mode stays**, now earned by R5's recorded-event-log test and by
    wanting the client runnable without either server in development.
22. **No backup path beyond Neon's own.** Neon branches and retains
    point-in-time recovery; losing a card cache costs money and minutes rather
    than unrecoverable data, because the corpus texts re-fetch and the cards
    rebuild from them.
23. **Gate 11, the production build**, lands with WP-R1 rather than WP-A1 —
    there is no bundle to build before then, and nexus's reason for the gate
    (a package invisible to every other gate until it fails a deploy) starts
    biting exactly when the app first bundles.
24. **Two packages are added to `ARCHITECTURE.md` §1's list**: `dependency-min-age`
    (gate 9's implementation, taken from argo) and `config` (foundation, holding
    `tiers.ts`, which §6.3 already treats as data rather than engine).

---

## 9. Nothing halts. What was decided instead.

An earlier draft of this section listed four conditions under which to stop and
ask. You have asked not to be interrupted, so each is now a decision taken in
advance, with the direction chosen to be the recoverable one.

| Formerly a halt condition | Decided now |
|---|---|
| No catalogue model accepts strict `json_schema` | The pipeline runs anyway. `provider-router` gains no JSON-repair loop — `ARCHITECTURE.md` §6.4 calls that a documented non-choice and it stays one. Instead the affected stages resolve to whichever tier does have a strict-schema model, and if **none** does, WP-X0's report says so and the six typed stages become a scoping question you answer with the report in hand rather than a guess I make without it. Until then every typed stage is tested against the scripted provider, which is where their logic is verified regardless. |
| gutendex's shape differs enough to change author identity | The id shape (`gutenberg:<slug>-<birthYear>`) is derived in **one function** with its own test, so a correction is one file. WP-X0's report names the change; the follow-up PR is small by construction. |
| No Ramp Router key can be obtained | Everything except S1's live half, K5, W2, X0 and X1 completes. The product is finished and unverified against a real gateway, which the plan states rather than hides — `docs/BASELINE.md` is written with the measures it could not fill marked `not measured`, never estimated. |
| `ARCHITECTURE.md` and `PRD.md` contradict in a way precedence does not resolve | Take the reading that preserves the four invariants, write the decision file, keep going. No contradiction found so far has needed more: the four in §8 that touched merged documents were resolved by amending them. |

**The one thing that would still be worth interrupting for** is a discovery that
invalidates an invariant — not a design detail, but a case where holding
invariant 1, 2, 3 or 4 turns out to be impossible as specified. That has not
happened, and if it does, it goes in the WP-X0 report rather than a mid-build
stop.

---

## 10. Done

v1 is done when:

- Every WP merged; all eleven gates green on `main`.
- **WP-X0's verification pass is green**, or every discrepancy it found has
  landed as a follow-up PR. A declared catalogue and a synthetic fixture are an
  acceptable state to build in and not an acceptable state to finish in.
- One real session runs idea to export against the live gateway, and
  `docs/BASELINE.md` reports all five `PRD.md` §10 measures with their sources —
  including any the build missed, stated as a number, and any it could not
  measure, marked `not measured` rather than estimated.
- `provenance-suite` passes with its five assertions enumerated and counted, and
  each has watched its negative control fail.
- The three spike notes are in `docs/spikes/` and every claim in
  `ARCHITECTURE.md` §5.2 and §6.4 that they contradict has a decision file.
- No catalogue row is still tagged `source: "declared"`, and no fixture filename
  still contains `synthetic`.
- `docs/DECISIONS.md` regenerates clean.
- Gate 10 passes with every ported file's sha256 intact — no seeded guideline
  edited in place, every deviation living in `docs/guidelines/local/`.
- `bun run preflight` passes against a complete `.env`.
- Every gate runs from `scripts/gates.ts` on the workflow A1 handed over, with
  no second handover having been needed.
- The one unit deploys, all fourteen routes answer, and a full run completes
  through `stage_queue` with the cron sweep enabled — including one run in which
  a stage invocation is deliberately dropped and the sweep recovers it.
