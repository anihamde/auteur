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
with what adaptation. `ARCHITECTURE.md` §11.1 requires them to land in **one**
`AGENTS.md`, not as a `docs/guidelines/` index, so they are distilled rather
than ported.

### 1.1 Why distilled rather than ported

`agent-guidelines`' port writes `docs/guidelines/*.md` plus a generated index
`AGENTS.md`. Two things make that the wrong shape here:

- `ARCHITECTURE.md` §11.1 chose nexus's one-file regime deliberately, over
  argo's document index, and named the reading cost as the reason.
- No profile expresses what auteur needs. It wants `frontend` **without**
  `nextjs` (Vite SPA, no App Router, no server components, no route handlers)
  and three of `backend`'s four documents **without** `auth` (single-user, no
  accounts). Bundles are taken whole by `extends`, so this composition is not a
  profile, and `meta/PORTING.md` forbids porting the nearest profile and editing
  the result.

So: **the rules below are written into auteur's `AGENTS.md` in full**, and
`.agent-guidelines.lock` records the source commit, the bindings and the
selected ids so a later refresh can diff against upstream. This is decision
`0001`.

Variable bindings: `PKG_SCOPE=@auteur`,
`COMPONENT_LIBRARY=@auteur/component-library`,
`TEST_COMMAND=bun run turbo test`.

### 1.2 ALWAYS — in `AGENTS.md` in full, read before any work

| Guideline | Taken as | Note |
|---|---|---|
| `testing` | adapted | TDD mandatory. The enforceable half is the gate: a package with implementation files and no colocated `*.test.ts` fails. Its parsimony rule ("every test covers something no other test covers") is the standard the Proof column below is written to. |
| `errors` | verbatim | Code offensively. No defensive guard, no swallowed failure, no silent fallback. Pairs with `ARCHITECTURE.md` §7.4's closed taxonomy. |
| `types` | verbatim | No `any`, no `as` on external data, no non-null assertion in `packages/`. |
| `control-flow` | verbatim | `undefined` over `null`, explicit checks, minimal mutation. |
| `functions` | verbatim | Arrow expressions, immutability, declarative iteration. |
| `files` | verbatim | Reading order, naming, where code lives. |
| `package-design` | verbatim | Many small packages. `ARCHITECTURE.md` §1's 33 packages are this rule applied. |
| `documentation` | verbatim | Prose changes in the same commit as the code it describes. |
| `git-and-prs` | adapted | Its conflict-surface rules are §3 of this plan, made concrete against auteur's actual magnets. |
| `tooling` | verbatim | Bun, Turborepo, Biome. Uniform task names, accurate turbo `inputs`/`outputs`. |
| `language-choice` | absorbed to one paragraph | TypeScript everywhere; v1 has no second language and no plausible Rust crate. The full document exists to arbitrate a choice auteur does not have. |
| `data-boundaries` | **promoted from `if-touched` to ALWAYS** | Invariant 4 *is* this document: every stage output crosses a zod schema, every external response is parsed rather than cast, every schema sent to a model is a declared contract. In a product that is seven model calls and two HTTP clients, its trigger fires on nearly every diff; leaving it conditional would mean re-deciding that per change. |

### 1.3 IF TOUCHED — in `AGENTS.md` with its trigger

| Guideline | Taken as | Trigger and adaptation |
|---|---|---|
| `monorepo` | verbatim | Adding a package, changing a `package.json`, moving code. `catalog:` for every third-party dep, `workspace:*` for every internal one. |
| `discriminated-unions` | verbatim | Defining or modifying a union. `SessionEvent`, `Evidence`, `ClarifyResult`, `ErrorCode` are all this shape. |
| `security` | adapted | Handling the Ramp key, gutendex responses, or any outbound request. auteur is single-user, so authorization is out; secret handling, untrusted-input parsing and dependency risk are in, and the key-based log redaction is a test in `logger`. |
| `database` | adapted | Postgres-on-Neon becomes `bun:sqlite`. What survives: no ORM, hand-written SQL, parameterized always, the database is the system of record. What is dropped: serverless connection pooling, which has no analogue in one local process. |
| `migrations` | adapted | Already the architecture's design (§3.3): the server converges the schema on access, nobody applies a migration by hand, never edit an applied migration. Postgres advisory-lock specifics become `BEGIN IMMEDIATE`. |
| `http-api` | adapted | Steps 1 and 2 (authenticate, authorize) do not exist — single-user, no accounts. Steps 3–5 stand: parse path, query and body with a schema before doing work; status codes that mean what happened; one error shape; never a 200 carrying an error. |
| `react` | adapted | Function components as `const` arrows with a `Props` type, no `className`/`style` passthrough, variants over boolean pairs, data over render instructions. The "Server Components by default" clause is struck: `apps/auteur-web` is a Vite SPA and has none. |
| `styling` | adapted | Panda CSS only. The preset is `@auteur/tokens`, generated from `docs/design/design-system/tokens/*.css`; `@auteur/component-library` consumes it rather than owning it. The static-extractor warning is kept verbatim — it is the failure mode that produces a class with no rule and no error. |
| `accessibility` | verbatim | Semantic HTML, accessible names, focus, keyboard operation. `test-support`'s axe audit is the automated half. |
| `icons` | pattern only | Phosphor is replaced by Lucide, so the import paths do not transfer. What transfers: one icon per import, size and colour through tokens via the component's own props, decorative icons `aria-hidden`, the icon that *is* the control carries a name. auteur's closed-set `Icon` wrapper (`ARCHITECTURE.md` §2) is stricter than the guideline. |

### 1.4 REFERENCE

| Guideline | Note |
|---|---|
| `ci` | Its failure rules (a failure you introduced is yours; a pre-existing one goes in a separate PR; "flake" is not a root cause; never skip a test to get green) and its speed rules (cache on the lockfile, `--affected`, a concurrency group, parallel independent jobs) are exactly what §2.3 and WP-A4 implement. |
| `option-result` | When a fallible API returns a `Result` instead of throwing. Relevant at three seams: provider calls, gutendex fetches, and `resolveCard`. |

### 1.5 Not taken

| Guideline | Why |
|---|---|
| `nextjs` | `apps/auteur-web` is Vite + React, one route, no App Router, no server components, no server actions, no route handlers. Every rule in it describes machinery auteur does not have, and its presence would make `react`'s server/client advice read as applicable. |
| `auth` | Single-user, no accounts, no sessions, no protected routes. `PRD.md` §4 puts accounts out of scope. |
| `deployment` | Runs locally. No Vercel, no Fly, no preview environments, no background workers. `PRD.md` §4 puts hosting out of scope. |
| `rust` | No crate, and none plausible: the two hot paths (segmentation, metric computation) are a set lookup per word over at most a few million words. |

`AGENTS.md` also carries what no guideline covers and `ARCHITECTURE.md` §11.1
requires: the four invariants, the tokens-only and ink/paper UI rules, the
`copy` content rules, the dependency/contract/catalog gates, and the two
commands.

**Proof that the selection holds:** `scripts/check-guidelines.ts --check`
reads `.agent-guidelines.lock`, asserts every selected id has a section in
`AGENTS.md` and every not-taken id has none, and fails if upstream's catalog
gains a document the lock does not classify. Gate 10.

---

## 2. Global rules

### 2.1 One reviewable change per PR

A work package is one PR. If a WP's diff cannot be held in a reviewer's head,
it was scoped wrong — split it and add the split to this file in the same PR.

Branch names are the WP id and its subject: `wp-e04-sentence-segmentation`.
Never a generated name.

### 2.2 The ten CI gates

Nine from `ARCHITECTURE.md` §11.2, plus the guideline gate from §1.5. All
blocking, all on every PR.

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
| 10 | Guideline selection | `scripts/check-guidelines.ts --check` |

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
deliberately · merged.

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

---

## 3. The file partition

A merge conflict here costs a resolve, a re-run and possibly a re-review. The
partition is designed so it does not happen, not so it is cheap when it does.

### 3.1 The rule

**After WP-A2, no work package edits a root-level file.** Every WP owns
`packages/<name>/src/<specific files>` or `apps/<app>/src/<area>` and nothing
else. The exceptions are enumerated below and each is a WP of its own that
lands alone.

This is what WP-A2 and WP-A6 buy: the complete manifest declaring all 35
packages and both apps up front, and one mechanical PR materialising every
skeleton from it. No later PR creates a `package.json`, and no two branches
race to add one.

### 3.2 Conflict-magnet register

| File | Owner | Rule |
|---|---|---|
| `package.json` (root: workspaces + catalog) | WP-A1, then catalog PRs C1–C4 | A dependency addition is its own PR, landed before the wave that needs it. Never bumped from a feature branch. |
| `bun.lock` | same | Follows the catalog PR. Regenerate after rebase, never hand-merge. |
| `turbo.json` | WP-A1, then WP-Z2 | Task graph lands complete at A1. One late tuning PR. |
| `biome.json` | WP-A1 | Never edited again. A rule that needs disabling gets a decision file first. |
| `bunfig.toml` | WP-A1 | `minimumReleaseAge` and the per-package `preload` blocks, all at once. |
| `.github/workflows/ci.yml` | WP-A4, then WP-Z2 | Same. |
| `scripts/packages.manifest.ts` | WP-A2, then **M-PRs** | Widening a package's exports is an M-PR: manifest edit + `fix:api-surface` + nothing else. Serialized: at most one open at a time. |
| `AGENTS.md` | WP-A5 | A rule change is a decision file plus an M-PR. |
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

## 4. The spikes

Three pieces of evidence gate real decisions. All three run at the very front
of the steps they gate. Two need network; one needs network and a real Ramp
Router key.

### S1 — Router capabilities (needs `RAMP_ROUTER_API_KEY` + network)

Gates every model stage: waves D, J, K, L.

Delivers `scripts/probe-router-responses.ts` (nexus's, extended) and
`docs/spikes/router-capabilities.md` recording, per catalogue model:

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

**Proof:** `docs/spikes/router-capabilities.md` has a row per model with all
four columns filled, and `packages/provider-router/tests/fixtures/` replays
without network.

**The branch this decides.** Six of the seven model stages are typed. If no
`cheap`-tier candidate accepts strict schemas:

- `corpus-select` and `critique` move to `balanced` — `ARCHITECTURE.md` §6.4 is
  explicit that the answer is not a JSON-repair loop.
- The §10 cost target is re-baselined from measurement in WP-X1 rather than
  asserted. `PRD.md`'s $0.15 median becomes a number to report against, and if
  it is missed the report says by how much and which stage spent it.
- Recorded as decision `0002`, written by this WP whichever way it goes.

`draft` is the one untyped stage; nothing about it depends on this outcome.

### S2 — gutendex response (needs network)

Gates wave I.

Records one real `GET https://gutendex.com/books?search=…&languages=en`
response as `packages/corpus-gutenberg/tests/fixtures/gutendex-search.json`,
one real book detail, and one plain-text fetch header set. Pins the zod schema
to the recording and produces
`docs/spikes/gutendex-schema.md` — a field-by-field diff against
`ARCHITECTURE.md` §5.2's claims, which are from public docs and unverified.

**Proof:** the schema parses the fixture; renaming any field in a copy of the
fixture makes the parse test fail with that field named. Every correction to
§5.2 is listed in the spike note and, if it changes the author-id shape,
recorded as a decision.

### S3 — Latinate validation set (needs network for one corpus file)

Gates WP-F5, and through it the report's measure count.

Delivers `scripts/draw-word-types.ts` (draws ~500 word *types* by frequency
from a cleaned real corpus, so the set weights words that occur rather than the
dictionary's tail), the hand-labelled fixture
`packages/prosody/tests/fixtures/latinate-validation.json`, and a comment in
the fixture stating plainly that the labels are hand-applied and that a suffix
list tuned against them is a fit to 500 labels.

**Proof:** the fixture has ≥500 entries, each `{ type, latinate: boolean }`,
drawn by frequency with the draw script committed and reproducible.

**The branch this decides** (`ARCHITECTURE.md` §4.3): precision ≥ 0.85 → five
scored measures; below → four, and `latinateRatio` becomes a register hint in
the draft prompt only. Written as decision `0003` by WP-F5, with the measured
precision and recall in it.

---

## 5. Two things the architecture leaves open

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

---

## 6. Work packages

Legend: **Deps** are WP ids. **[mech]** = mechanical, no review round.
**[net]** = needs network. **[key]** = needs a real Ramp Router key.
Every Proof names a test or a gate.

### Wave A — the conflict magnets. Strictly serial.

Nothing else starts until A2 and A3 land. A5 may run parallel to A3/A4.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **A1** | Root toolchain: bun workspaces, the complete catalog, `turbo.json` task graph, `biome.json`, `bunfig.toml` (`minimumReleaseAge = 604800`), base `tsconfig`, `packages/tsconfig`, `packages/biome-config` | `/package.json`, `/bun.lock`, `/turbo.json`, `/biome.json`, `/bunfig.toml`, `/tsconfig.json`, `/.gitignore`, `/.nvmrc`, `packages/tsconfig/**`, `packages/biome-config/**` | `bun install --frozen-lockfile` succeeds; `biome check` and `tsc --noEmit` pass on the two tooling packages | — |
| **A2** | `scripts/packages.manifest.ts`: all 35 packages and both apps from `ARCHITECTURE.md` §1 plus two the plan adds, with layer, `workspaceDeps`, subpath `exports`, coverage floors. `core` and `copy` split into per-area subpaths so §3.2's partition holds | `scripts/packages.manifest.ts`, `scripts/packages.manifest.test.ts` | A test asserting every package named in `ARCHITECTURE.md` §1's table is present, that `LAYERS` matches §1's order, and that `component-library`'s `workspaceDeps` are exactly `tokens, icons, copy, formatting, core` | A1 |

The two packages the plan adds to §1's list: `dependency-min-age` (argo's, gate 9) and `config` (foundation layer, holding `tiers.ts` — `ARCHITECTURE.md` §6.3 calls it `config/tiers.ts` and treats it as data rather than engine, which makes it a package rather than a file inside `pipeline`). Both are recorded as decisions.
| **A3** | Gate scripts ported from nexus: `check-dependencies`, `api-surface`, `new-package`, `package-tests`, `check-catalog`, `check-bun-version`, `preflight`, `gate-self-test`; plus `check-min-age` (argo's `dependency-min-age`, as `packages/dependency-min-age`) and `check-guidelines` | `scripts/*.ts` except the manifest, `packages/dependency-min-age/**` | `bun run scripts/gate-self-test.ts` green, with a case per gate 4, 5, 6, 9, 10: a cycle, a layer violation, a `component-library` import past its five, a widened export with no manifest edit, a drifted skeleton, an under-age dependency, an `AGENTS.md` missing a selected guideline | A2 |
| **A4** | `.github/workflows/ci.yml`: the ten gates as jobs, concurrency group keyed on the ref, turbo cache restored on the lockfile hash, `--concurrency=100%`, independent jobs in parallel | `.github/workflows/ci.yml`, `.github/actions/**` | CI green on its own PR, with `gate-self-test` a named job whose failure fails the build | A3 |
| **A5** | `AGENTS.md` (§1's selection in full, plus §11.1's auteur-specific rules), `CLAUDE.md`, `.agent-guidelines.lock`, `docs/decisions/0001-guidelines-in-one-file.md`, the `decisions:index` script | `/AGENTS.md`, `/CLAUDE.md`, `/.agent-guidelines.lock`, `docs/decisions/**`, `scripts/decisions-index.ts` | Gate 10: `check-guidelines --check` passes, and fails when a selected id's section is deleted from `AGENTS.md` | A2 |
| **A6** **[mech]** | Every package and app skeleton materialised from the manifest: `package.json`, `tsconfig.json`, `bunfig.toml`, `README.md`. No `src/`. A package with no `src/` is *declared, not materialised*; gates 3 and 4 skip it | `packages/*/package.json`, `packages/*/tsconfig.json`, `packages/*/README.md`, `apps/*/…` | Gate 6 (`new-package.ts --check`) passes on a clean tree; deleting one generated line fails it | A3, A4 |

### Wave S — the spikes. Start at A6; do not wait for wave B.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **S1** **[key][net]** | §4's router-capability probe and its note | `scripts/probe-router-responses.ts`, `docs/spikes/router-capabilities.md`, `packages/provider-router/tests/fixtures/**` | §4/S1 | A6 |
| **S2** **[net]** | §4's gutendex recording and schema diff | `scripts/probe-gutendex.ts`, `packages/corpus-gutenberg/tests/fixtures/**`, `docs/spikes/gutendex-schema.md` | §4/S2 | A6 |
| **S3** **[net]** | §4's latinate validation set | `scripts/draw-word-types.ts`, `packages/prosody/tests/fixtures/latinate-validation.json` | §4/S3 | A6 |

### Wave B — foundation. Fully parallel after A6.

Twelve independent branches; none shares a file with another.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **B1** | `ids` — UUIDv7 and the branded id types | `packages/ids/src/**` | Property test: 1,000 minted ids sort lexicographically in mint order, and each carries version nibble 7 and variant `10` | A6 |
| **B2** | `errors` — `AuteurError`, `ARCHITECTURE.md` §7.4's closed taxonomy, `toHttpResponse` | `packages/errors/src/**` | A table test mapping every `ErrorCode` to exactly one status; a test that `toHttpResponse` on a non-`AuteurError` returns 500 with a fixed message and **does not** include the thrown message | A6 |
| **B3** | `env` — one schema, deferred-then-memoized parse | `packages/env/src/**`, `/.env.example` | A test that `.env.example` names exactly the schema's keys; a missing required var fails naming that var | A6 |
| **B4** | `logger` — structured JSON, key-based redaction | `packages/logger/src/**` | A record containing `apiKey`, `authorization` and `RAMP_ROUTER_API_KEY` emits `[redacted]` for each, at any nesting depth | A6 |
| **B5** | `core/session` — session, step, preset, question, decision-entry types and schemas | `packages/core/src/session.ts` + test | Round-trip per schema; a `Question` with an empty `decision` fails parse | A6 |
| **B6** | `core/style-card` — `Claim`, `Origin`, `StyleCard`, `CardOverlay`, `AuthorRef`, `WorkRef` | `packages/core/src/style-card.ts` + test | A `Claim` with `origin: "derived"` and no `citation` fails parse; `prosody` is typed as a bare `ProsodyBlock` and a type-level test asserts there is no `Claim<ProsodyBlock>` shape it accepts | A6 |
| **B7** | `core/prosody` + `core/fit` — `ProsodyBlock`, `DialogueMarker`, `ProsodyTarget`, `FitMeasure`, `Finding`, `StyleFitReport` | `packages/core/src/prosody.ts`, `src/fit.ts` + tests | Round-trip; `FitMeasure.status` union is exactly the four values `ProsodyStat`'s `.d.ts` declares | A6 |
| **B8** | `core/pipeline` + `core/events` — `Stage`, `Tier`, `Role`, `Pipeline`, the `SessionEvent` union | `packages/core/src/pipeline.ts`, `src/events.ts` + tests | Exhaustiveness test: a `switch` over `SessionEvent["type"]` with no default compiles, and adding a member breaks it | A6 |
| **B9** | `formatting` — `relativeTime`, `pluralize`, `metaRow`, `elapsed`, `prosodyValue`, `money` | `packages/formatting/src/**` | Table per function. `prosodyValue` never emits a trailing zero; `money` always emits two decimals; property: `elapsed` is monotone in its input | A6 |
| **B10** | `test-support` — happy-dom preload, styled `render`, axe audit, provider conformance suite | `packages/test-support/src/**` | Self-test: the preload runs before a DOM import; the axe audit fails on a fixture with an unlabelled input; the conformance suite fails against a provider that drops a delta | A6 |
| **B11** | `test-support/scripted-provider` — the scripted fake provider the pipeline is tested against | `packages/test-support/src/scripted-provider.ts` + test | Replays a scripted turn including a mid-stream error, a cancellation and a truncation, and asserts the emitted delta sequence exactly | B10 |
| **B12** | `copy` — module-per-screen layout, the barrel, and the content rules as tests | `packages/copy/src/index.ts`, `src/rules.test.ts`, `src/shell.ts` | The rule tests enumerate the barrel and fail on: an emoji, an exclamation mark outside the named punctuation-table exemption, a terminal period on a label, an in-app "we"/"I"/"Let's", a banned word (`AI-powered`, `magic`, `effortless`, `seamless`, `unleash`, `craft` as a verb, `in seconds`, `just`), and `Analyzing…` | A6 |

### Wave C — catalog PRs. Each lands alone, ahead of the wave it serves.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **C1** **[mech]** | `zod`, `fast-check` in the catalog | `/package.json`, `/bun.lock` | Gate 9 passes; `bun install --frozen-lockfile` clean | A1 |
| **C2** **[mech]** | `openai` in the catalog | same | same | A1 |
| **C3** **[mech]** | `@pandacss/dev`, `postcss`, `@base-ui-components/react`, `lucide-static` | same | same | A1 |
| **C4** **[mech]** | `hono`, `vite`, `react`, `react-dom`, `@axe-core/*` | same | same | A1 |

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
| **E1** | The tokenizer: a maximal run of letters, digits, apostrophes and internal hyphens, Unicode-aware, leading/trailing apostrophe stripped | `packages/text/src/tokenize.ts` | Property: word count is additive over a concatenation with a separator; table asserting `don't`, `well-known`, `'quoted'`, `word—word`, `…`, and a surrogate-pair emoji each tokenize as specified. A companion test asserting `split(/\s+/)` gives a *different* count on the same fixture, so the rule cannot be quietly relaxed | A6, C1 |
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
| **F5** | The latinate classifier, its suffix and exception lists, and the precision gate | `packages/prosody/src/latinate.ts`, `src/latinate-lists.ts` | The test **prints and asserts** precision and recall against S3's fixture. Precision ≥ 0.85 → the export is marked scored; below → marked `hint-only`. Either way it writes decision `0003` with the measured numbers | E1, S3 |
| **F6** | `commonBigrams`: 25 most frequent adjacent pairs, dropping pairs where both are stopwords | `packages/prosody/src/bigrams.ts` | Table against a fixture; ties broken deterministically, asserted by running twice | E1 |
| **F7** | `ProsodyBlock` assembly, `perWork` aggregation, `prosodyVersion` | `packages/prosody/src/index.ts`, `src/version.ts` | A real cleaned Gutenberg work produces a full block whose numbers are asserted against hand-counts for two of the seven measures; `perWork` shares sum to 1 | F1–F6 |

### Wave G — persistence. Serial.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **G1** | `db`: `bun:sqlite` open, the four pragmas, SQL primitives. Knows no domain | `packages/db/src/**` | A test reading back `journal_mode`, `synchronous`, `foreign_keys` and `busy_timeout` from a freshly opened handle; a test that a `REFERENCES` violation actually throws, which is what proves `foreign_keys = ON` rather than the pragma read | B2, B3 |
| **G2** | `migrations`: the ledger, the build step inlining SQL into `src/generated/manifest.ts` with checksums, `ensureSchema()` | `packages/migrations/src/**`, `packages/migrations/sql/0001_ledger.sql` | Four named tests: fresh database applies every migration once; a mutated checksum aborts naming the file and applies nothing; the fast path issues exactly one query on an up-to-date database (asserted via a query log); two handles racing `ensureSchema()` both return and each migration applies once | G1 |
| **G3** | `sql/0002_schema.sql`: `ARCHITECTURE.md` §3.2's tables | `packages/migrations/sql/0002_schema.sql` + test | A schema snapshot test over `pragma table_info` for every table; **every `CHECK` constraint independently violated and rejected**, named one test each — including `sessions.step`, `answer_state`, `stage_runs.status`, `artifacts.kind`, and the `UNIQUE (author_id, version)` and `UNIQUE (build_key)` pair | G2 |
| **G4** | `migration:new` scaffold and the one-rewrite-`ALTER`-per-table lint | `scripts/new-migration.ts`, `scripts/check-migrations.ts` | `check-migrations.ts` rejects a fixture file with two create-copy-drop-rename sequences on one table; `migration:new` produces a file that the checksum step accepts and that applies nothing on its own | G2 |

### Wave H — stores. Fully parallel after G3.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **H1** | `session-store`: sessions, answers, artifacts, `input_key` reads and writes | `packages/session-store/src/**` | An artifact written with one `input_key` reads back stale after a dependency's key changes and fresh when it does not — the two halves of §7.5 as two tests | G3, B5 |
| **H2** | `card-store`: the versioned card cache | `packages/card-store/src/**` | Inserting a card with an existing `build_key` returns the existing row and does **not** create version 4; a genuinely new key gets `max(version) + 1` for that author | G3, B6 |
| **H3** | `corpus-store`: `works` and `passages` | `packages/corpus-store/src/**` | The cache key is `(source_url, cleaner_version)`: the same url under a bumped cleaner version is a miss, under the same version a hit; deleting a work cascades its passages | G3 |
| **H4** | `event-store`: the durable log | `packages/event-store/src/**` | **Ordering:** a test with a subscriber that records what it received asserts no delivered event is absent from the table — the append-then-fan-out rule as an assertion, not a convention. **Gaps:** 200 concurrent appends produce `seq` 1..200 with no gap and no duplicate | G3, B8 |

### Wave I — `corpus-gutenberg`. Serial after S2 and E2.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **I1** | gutendex client and the zod schema pinned to S2's fixture | `packages/corpus-gutenberg/src/gutendex.ts`, `src/schema.ts` | The fixture parses; a copy with any single field renamed fails the parse, and the failure names the field | S2, C1 |
| **I2** | Author folding and id minting (`gutenberg:<slug>-<birthYear>`) | `packages/corpus-gutenberg/src/authors.ts` | Two authors sharing a display name and differing in birth year mint distinct ids; a changed upstream name mints a second id rather than rewriting the first; an author with no birth year mints a stable id without one | I1 |
| **I3** | Text fetch: plain-text format preference, ≤4 concurrent, one retry on 5xx/timeout at 2s then 4s, none on 4xx | `packages/corpus-gutenberg/src/fetch.ts` | Against a scripted fetch: a 500 retries exactly once then throws `corpus_unavailable`; a 404 throws immediately with no retry; a book with no plain-text format is dropped from selection rather than fetched as HTML; concurrency never exceeds 4 | I1, E2 |
| **I4** | Passage selection: 400–900 word windows on paragraph boundaries, sampled uniformly, first and last 5% excluded | `packages/corpus-gutenberg/src/passages.ts` | Deterministic: the same work yields byte-identical passages across two runs; every passage starts and ends on a block boundary; none overlaps the excluded margins; roughly forty candidates from a twelve-work corpus | E5, I3 |
| **I5** | The `CorpusProvider` seam and `AuthorResult`'s three detail-line states | `packages/corpus-gutenberg/src/provider.ts` | The three §5.3 states are three tests over the same author at three cache states; a `secondary`-kind provider registered alongside unions into search results without changing the builder | I2, H3 |

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
| **K5** **[key][net]** | `style-extract` wired end to end: real passages, structured output, a real card | `packages/style-card/src/extract.ts` | An env-gated integration test producing a real card for a real author, written to `docs/spikes/first-card.json` and inspected in the PR body. Offline, the same path runs against B11's scripted provider | K1, D3, J3 |

### Wave L — `pipeline`. Serial, with L3 landing alone.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **L1** | Stage graph types and the default pipeline definition (`ARCHITECTURE.md` §6.2, ten stages) | `packages/pipeline/src/pipeline.ts` | `reads` forms a DAG over the ten stages — asserted by a cycle check; every stage with an `outputSchema` has a `promptTemplate` and a `tier`, and every stage with neither has both absent | B8 |
| **L2** | Tier resolution, layers 1 and 2 | `packages/pipeline/src/resolve-tier.ts` | A catalogue with no strict-schema `cheap` model makes resolution fail **at startup**, naming the tier and the stage — not at run time; a stage whose `maxOutputTokens` requirement no candidate meets fails the same way | L1, D4 |
| **L3** | `config/tiers.ts` — §5.2's candidate lists | `packages/config/src/tiers.ts` | Every listed model id exists in the catalogue constant; the first eligible candidate per tier is asserted for the seven stages | L2 |
| **L4** | Session pins, layer 3 | `packages/pipeline/src/pins.ts` | Pinning a non-strict model to `outline` is refused with the reason in the error; the same pin on `draft` is accepted; a pin for an unknown stage id is refused | L3, H1 |
| **L5** | The engine loop, event emission, and the no-I/O assertion | `packages/pipeline/src/engine.ts`, `src/no-io.test.ts` | Against B11's scripted provider, a full run's `SessionEvent` sequence is asserted exactly, including a stage failure and a mid-stream cancellation; `no-io.test.ts` asserts the engine imports no `fetch`, no `node:fs`, no clock beyond what it is handed | L1, H4, B11 |
| **L6** | `clarify` re-entry and the budget | `packages/pipeline/src/clarify.ts` | 3 rounds and 8 questions are constants in code with a test: a scripted provider returning five questions in round 3 is truncated to the remaining budget; a question missing `decision` fails the schema and never reaches the UI; a round-2 question whose `whyNotSettled` references no answered question is dropped | L5, J4 |
| **L7** | Draft strategy selection | `packages/pipeline/src/strategy.ts` | A table over four presets × three `maxOutputTokens` values asserting the resolved strategy, with `TOKENS_PER_WORD = 1.4` and `SAFETY = 1.15` named constants; the resolved strategy — not the preset's suggestion — is what the returned value carries | L4 |
| **L8** | `sequential-scene`: per-beat calls, the running summary, per-beat critique | `packages/pipeline/src/sequential.ts` | A four-beat run against the scripted provider makes one draft call per beat, one summary call between beats, and one critique per beat; the last 500 words of beat *n* appear verbatim in beat *n+1*'s prompt | L7, J8 |
| **L9** | Usage accounting, cost at write time, cancellation | `packages/pipeline/src/usage.ts` | Cached input tokens are priced at the cached rate and excluded from `inputTokens` — asserted with a three-way usage fixture where folding them in would over-report by more than 3×; a cancellation mid-stream writes `status: "cancelled"` with the tokens already billed recorded | L5, D4 |
| **L10** | Live drift (§6.7) | `packages/pipeline/src/drift.ts` | A scripted draft stream emits one `drift` event per paragraph boundary and none mid-paragraph; `mattr` is absent below 1,000 words and `dialogueRatio` absent until the marker convention has appeared — the two suppressions as two named tests | L5, F7 |

### Wave P/Q — design system. Runs from wave B onward, touching nothing waves D–N touch.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **P1** | `tokens`: the Panda preset generated from the design CSS | `packages/tokens/src/preset.ts` | Gate 7: the test **re-reads** `docs/design/design-system/tokens/*.css` at test time and re-derives every expectation. Changing one hex digit in the CSS fails it; the test contains no transcribed literal | A6, C3 |
| **P2** | The inverted theme condition and `prefers-reduced-motion` | `packages/tokens/src/conditions.ts` | `_light` is wired as `[data-theme="light"] &` and there is no `_dark`; a test asserting a token resolves to the dark value with no attribute set. `_reducedMotion` collapses `dur-instant` through `dur-stream` to `0ms`, asserted on the generated CSS | P1 |
| **P3** | `icons`: the closed-set Lucide wrapper, sizes 14/16/20 | `packages/icons/src/**` | A test enumerating the exported set exactly; a type-level test that a name outside it does not compile; a decorative icon renders `aria-hidden`. `ARCHITECTURE.md` §2 says ten glyphs and the handoff's working set names eight (`check`, `chevron-down`, `arrow-right`, `arrow-left`, `git-branch`, `clock`, `sun`, `moon`) — this WP settles the set against the prototype and records the delta as a decision | P1, C3 |
| **Q1** | `component-library` infrastructure: Panda config extending `@auteur/tokens`, the specimen harness, axe wiring, the adherence lint from `_adherence.oxlintrc.json` | `packages/component-library/panda.config.ts`, `src/harness/**` | The lint fails a fixture component containing a hardcoded hex, px, duration or easing that has a token; the specimen harness renders and the axe audit runs in CI | P2, B10, C3 |
| **Q2** | `core`: `Button`, `Card`, `CardHeader`, `Badge`, `Icon` | `packages/component-library/src/core/**` | Props match `docs/design/design-system/components/core/*.d.ts` exactly — a type-level test importing each `.d.ts` and asserting assignability both ways; every variant rendered; the focus ring present and never suppressed; disabled at `opacity: 0.42` with `cursor: not-allowed`, matching the handoff | Q1 |
| **Q3** | `forms`: `Field`, `Input`, `Select`, `Textarea` on Base UI | `packages/component-library/src/forms/**` | Same contract test; keyboard operation and focus order for `Select`; axe clean with and without a `Field` label | Q1 |
| **Q4** | `prose`: `Markdown`, `Exemplar` | `packages/component-library/src/prose/**` | Both default to `ground="paper"` — asserted with no prop passed. **`Exemplar` has no code path mutating its `text`**: a test enumerating the module's exports and asserting no setter, plus a render test that the DOM text equals the prop byte for byte | Q1 |
| **Q5** | `pipeline`: `Thinking`, `ProsodyStat`, `ProvenanceMark`, `WizardRail` | `packages/component-library/src/pipeline/**` | **`ProsodyStat` has no paper variant** — a type-level test that `ground` is not an accepted prop; it renders the target as a hairline tick distinct from the value marker; `WizardRail` renders completed steps clickable and pending steps not; `ProvenanceMark` renders `edited` in amber with a reset affordance | Q1 |
| **Q6** | `theme`: `ThemeToggle` and the resolver ported from `wizard-handoff/theme.js` | `packages/component-library/src/theme/**` | `auto` resolves to light between 06:00 and 18:00 local and re-checks each minute (asserted with an injected clock); an explicit choice persists under `auteur.theme`; the head script runs before first paint, asserted by a test that the resolved attribute is set before the first render | Q1 |

### Wave M/N — API and server. Serial after H and L.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **M1** | `api-contract`: one zod object, `ARCHITECTURE.md` §7.1's fourteen routes | `packages/api-contract/src/**` | Fourteen routes enumerated from the object, asserted by count and by path; a request schema round-trips; changing a response shape breaks the client's compile (asserted in M2) | B5–B8 |
| **M2** | `api-client`: generated from the contract | `packages/api-client/src/**` | A type-level test that a route removed from the contract removes it from the client; every method's return type is the contract's response schema output | M1 |
| **M3** | `stream-client`: cursor, replay, de-duplicate, reconnect | `packages/stream-client/src/**` | Four named tests, one per §7.3 failure row: a drop reconnects from the cursor and delivers each missed event exactly once with no duplicate; a 404 is fatal at once; an unparseable frame is fatal at once rather than reconnecting into the same frame forever; `close()` is idempotent and aborts the in-flight request | M1, B8 |
| **N1** | Server skeleton, `GET /api/health`, `GET /api/models` | `apps/auteur-server/src/app.ts`, `src/routes/health.ts`, `src/routes/models.ts` | An HTTP-level test per route; a malformed query returns 400 in the contract's error shape, never a 200 carrying an error | M1, L3, C4 |
| **N2** | Session routes: create, read, patch, delete | `apps/auteur-server/src/routes/sessions.ts` | `GET /api/sessions/:id` after a reload returns idea, step, answers, artifacts and the three result tabs' data in one response; an unknown id is 404 | N1, H1 |
| **N3** | `GET /api/authors` — search unioned across providers | `apps/auteur-server/src/routes/authors.ts` | The three §5.3 detail-line states appear in the response as three distinct shapes; a provider throwing does not fail the union, and its absence is reported | N1, I5 |
| **N4** | `POST /api/sessions/:id/advance` and the staleness computation | `apps/auteur-server/src/routes/advance.ts`, `src/staleness.ts` | **Six named tests, one per §7.5 consequence**: changing an answer restales `outline` onward and not the card; changing the author restales everything after `corpus-select` and keeps the idea; changing the preset restales `outline` and `draft` and not the card; pinning a different model for `outline` restales `outline` onward; re-entering a step and changing nothing restales nothing; `advance` runs exactly the stale stages in graph order | N2, L5 |
| **N5** | Answers and regenerate | `apps/auteur-server/src/routes/answers.ts`, `src/routes/regenerate.ts` | Editing an answer marks every transitive descendant `invalidated` and keeps the rows; a selection above 60% of the word count is refused with `invalid_input`; a selection is snapped outward to sentence boundaries before it reaches the prompt, asserted on the prompt input | N4, L6, E7 |
| **N6** | `PUT /api/sessions/:id/pins` | `apps/auteur-server/src/routes/pins.ts` | Writing seven pins at once (the "one model for every stage" path) is validated per stage: a non-strict model is refused for the six typed stages with the reason, and the whole write is rejected rather than partially applied | N4, L4 |
| **N7** | `GET /api/sessions/:id/events` — SSE with cursor replay | `apps/auteur-server/src/routes/events.ts`, `src/broker.ts` | A client disconnecting mid-run and reconnecting at its cursor receives every missed event exactly once; a run completing with no client connected still persists every event; the broker never pushes an event absent from `events` | N4, H4, M3 |
| **N8** | `GET /api/sessions/:id/export` | `apps/auteur-server/src/routes/export.ts` | Returns `text/markdown` containing the §7.6 label verbatim; there is no query parameter or code path producing a document without it | N2, U1 |

### Wave R — the web app. R2 first; R3–R9 parallel after R1.

Each screen WP owns its screen directory and its own `copy` module.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **R1** | App shell: the 236px rail, the main column, the seven-step routing, the theme script in `<head>` | `apps/auteur-web/src/shell/**`, `packages/copy/src/shell.ts` | The rail's mono notes derive from session state in one selector and survive a reload — asserted by mounting from a serialized session; completed rows clickable, pending not; no flash of the wrong ground, asserted by the attribute being set before first render | Q2–Q6, M2 |
| **R2** | Draft screen — built first, because it exercises both grounds and the live measurement | `apps/auteur-web/src/screens/draft/**`, `packages/copy/src/draft.ts` | Prose renders on a paper card and the drift aside on ink, in one view; `drift` events update the aside without re-rendering the prose; the caret animation collapses to `0ms` under `prefers-reduced-motion` | R1, L10, M3 |
| **R3** | Idea screen | `.../screens/idea/**`, `packages/copy/src/idea.ts` | The Length field's hint is the **resolved** strategy, not the preset's suggestion — asserted for a `long` preset against a model whose `maxOutputTokens` would allow `single-call` | R1, L7 |
| **R4** | Author screen | `.../screens/author/**`, `packages/copy/src/author.ts` | Search debounces at 250ms and aborts on the next keystroke; the three §5.3 detail-line states render distinctly; the `secondary` row is disabled with its reason stated | R1, N3 |
| **R5** | Research screen and the style card | `.../screens/research/**`, `packages/copy/src/research.ts` | Three `Thinking` rows including `prosody-compute` with a null tier badge; detail lines come from `stage_detail` events and are never composed in the browser — asserted by rendering from a recorded event log and diffing the text against it | R1, N7 |
| **R6** | Clarify screen | `.../screens/clarify/**`, `packages/copy/src/clarify.ts` | "Generate now" is live from the end of round 1 and jumps to `outline` client-side; every rendered question shows its why-asked line; the budget meter's spent segments equal the question count | R1, N5 |
| **R7** | Outline screen | `.../screens/outline/**`, `packages/copy/src/outline.ts` | The beat sheet renders on a paper card; the footer caption names the model and tier the draft will run on, read from resolution rather than from the tier map | R1, N4 |
| **R8** | Result screen: three tabs | `.../screens/result/**`, `packages/copy/src/result.ts` | The three tabs are three reads of one `GET /api/sessions/:id`, asserted by a single-request test; the provenance label renders on the story tab; selecting a span turns the ghost button into "Regenerate selection" | R1, N5, T2 |
| **R9** | Model overlay, including "use one model for every stage" | `.../screens/models/**`, `packages/copy/src/models.ts` | The one-model control writes seven pins in one request and surfaces a per-stage refusal with its reason rather than applying partially; "Follow tier defaults" clears every pin; the panel scrolls inside the viewport with its footer reachable | R1, N6 |

### Wave T/U/V — the report, the export, and gate 8.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **T1** | Bands: interquartile over sentences, or over `perWork`; `bandBasis: "range"` under four works | `packages/style-fit/src/bands.ts` | A card from three works records `bandBasis: "range"` and the report says so; a card from twelve records `"iqr"`; the two thresholds (`pass` inside, `drift` within 1.5 band widths, `fail` beyond) are one constant with a table test at each boundary | F7, B7 |
| **T2** | The scored measures and `FitMeasure[]` assembly | `packages/style-fit/src/measures.ts` | The scored set is exactly five, or four if F5's gate failed — the test reads F5's exported gate result rather than hardcoding the count, so the two cannot disagree; `commonBigrams` and `paragraphLength` are asserted absent from the scored set | T1, F5 |
| **T3** | The two-verdict path for an edited target | `packages/style-fit/src/edited.ts` | With a hand-built overlay, an edited measure appears **twice** in `FitMeasure[]`, once `edited` and once `measured`; a type-level test that there is no single-verdict return for an edited measure | T2, K2 |
| **T4** | `critique` finding validation and the `revise` handoff | `packages/style-fit/src/findings.ts` | A finding whose `text` contains no digit is dropped; a finding citing a path absent from the card and the measures is rejected; `revise` receives only findings with `status !== "pass"` | T2, J7, J8 |
| **U1** | `export`: `renderExport(story, label)` | `packages/export/src/**` | `label` is a required parameter — a type-level test that the call does not compile without it; a fixture export contains the §7.6 sentence verbatim, and the document carries the label, the author and card version, the fit summary and the decisions log | K2, T2 |
| **V1** | `provenance-suite` — gate 8 | `packages/provenance-suite/src/**` | The five §11.2 assertions, each with a negative control in `gate-self-test.ts`: a fabricated card whose `prosody` differs from the computed block fails; an uncited `derived` claim fails; **a fixture writing `card_overlays` outside the suite's own fixtures fails**; an edited measure appearing once fails; an export fixture missing the label fails | K2, T3, U1, L5 |

### Wave W/X/Z — instrumentation, the real run, and CI tuning.

| WP | Delivers | Files owned | Proof | Deps |
|---|---|---|---|---|
| **W1** | `bun run stats` — completion rate and time-to-draft from `sessions` and `stage_runs` | `scripts/stats.ts` | Against a seeded database, completion rate and median time-to-draft match hand-computed values; time-to-draft measures `corpus-select.started_at` to `draft`'s first `stage_delta`, asserted against a recorded event log | H1, L9 |
| **W2** **[key][net]** | `bun scripts/discrimination.ts` (§10.3) | `scripts/discrimination.ts` | Runs against held-out passages `corpus-select` did not choose — asserted by intersecting the held-out set with the card's `sources` and requiring it empty | K5, W1 |
| **X1** **[key][net]** | One real end-to-end flash story, and `docs/BASELINE.md` recording all five §10 measures | `docs/BASELINE.md` | The five measures reported with their sources: style fidelity from `style-fit`, completion and time-to-draft from `stats`, cost from `SUM(stage_runs.cost_micros)`, discrimination from W2. A missed target is reported as a number and a stage, not smoothed | R8, V1, W2 |
| **X2** | The stage-to-tier experiment §5.2 promises: `style-extract` at `strong`, `critique` at `balanced`, each measured | `docs/BASELINE.md` (appended), `packages/config/src/tiers.ts` | Two config edits, two runs, the deltas in style fidelity and cost recorded. Whatever it shows becomes a decision file | X1 |
| **Z1** | `preflight.ts` completing: every env var validated, failing fast with the missing name | `scripts/preflight.ts` | Run against an incomplete `.env`, it names the first missing variable and exits non-zero | B3, D4 |
| **Z2** | CI tuning: `--affected` on pull requests, turbo remote caching, verified `inputs`/`outputs` | `/turbo.json`, `.github/workflows/ci.yml` | A no-op PR runs zero package tasks; a one-package PR runs that package and its dependents only; a deliberately inaccurate `outputs` declaration is caught by a cache-hit test on a clean tree | A4, and every wave's tasks declared |

---

## 7. Parallelism and the sequences that cannot be compressed

**Serial spine.** `A1 → A2 → A3 → A4 → A6`, then
`G1 → G2 → G3 → H* → N* → R*` and
`E* → F* → K* → L* → N*`. Nothing in wave A may overlap; each of its five PRs
edits root files.

**Runs in parallel with everything, from A6 onward:**

- **The spikes S1, S2, S3.** They gate D, I and F5 respectively and each takes
  network time nothing else is waiting on. Start all three the moment A6 lands.
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

1. **A1 before everything.** Its gates are this plan's enforcement mechanism.
2. **A2 before A6 before any package's `src/`.** The manifest is what makes the
   file partition hold; materialising skeletons piecemeal reintroduces the
   `package.json` race the whole partition exists to prevent.
3. **S1 before D1.** The three new `ModelDescriptor` fields are the spike's
   output. Writing the type first and filling it later means writing it twice.
4. **S3 before F5 before T2.** The measure count is a measured outcome; T2's
   test reads F5's gate result rather than a literal, so building T2 first
   would mean guessing.
5. **G3 before every store.** Changing the schema after four stores exist is
   the expensive version of the same change.
6. **L1 before L2 before L3.** Tier resolution is meaningless without the stage
   requirements it resolves against, and the candidate lists are meaningless
   without the resolver.
7. **K2 before V1.** `provenance-suite` enumerates `style-card`'s exports; it
   cannot enumerate an unwritten module.
8. **X1 last.** A cost and fidelity baseline measured against a partial
   pipeline is a number that will be quoted and is not true.

**Catalog PRs C1–C4** land alone, each ahead of the wave it serves: C1 before
B, C2 before D, C3 before P, C4 before N.

---

## 8. Decisions taken here, without review

Applied as written; each is reversible and none blocks. Every one gets a
`docs/decisions/` file.

1. **Guidelines are distilled into one `AGENTS.md`, not ported as a document
   index** (§1.1). The lock file preserves provenance.
2. **`data-boundaries` is promoted to ALWAYS** (§1.2). Its trigger fires on
   nearly every diff in a product that is seven model calls and two HTTP
   clients.
3. **A package with no `src/` is declared, not materialised**; gates 3 and 4
   skip it. This is what makes WP-A6's single skeleton PR possible, and it is a
   one-line delta from nexus's `api-surface.ts`.
4. **`docs/DECISIONS.md` is generated from `docs/decisions/`**, not hand-edited.
   An index every branch appends to is a conflict on every branch.
5. **`core` and `copy` are split into per-area subpath exports** declared in the
   manifest up front, so concurrent branches never edit the same file.
6. **`summarize-beat` is untyped** (§5.1). A summary is prose, and typing it
   would put a strict-schema requirement on the cheap tier for nothing.
7. **`revise` is typed** — six of the seven model stages are typed, `draft` is
   the exception.
8. **Provisional tier lists ship before S1 completes** (§5.2), so wave L is not
   blocked; S1's follow-up PR replaces them and owns that file alone.
9. **`style-extract` stays at `balanced`** despite being the longest-lived
   output, and WP-X2 measures the alternative rather than arguing about it.
10. **Base UI is the headless kit** for `Select`, `Textarea` and the overlay,
    as both reference repos use.
11. **Two packages are added to `ARCHITECTURE.md` §1's list**: `dependency-min-age`
    (gate 9's implementation, taken from argo) and `config` (foundation, holding
    `tiers.ts`, which §6.3 already treats as data rather than engine).

---

## 9. The only reasons to stop and ask

1. S1 finds the gateway does not support `text.format json_schema` with
   `strict: true` on **any** model. That is not the §4 branch — it invalidates
   invariant 4's implementation strategy for six stages, and the alternative
   (`ARCHITECTURE.md` §6.4's documented non-choice) is a design change.
2. S2 finds gutendex's shape differs from §5.2 in a way that changes the author
   identity model — for instance, no stable name string to slug.
3. A Ramp Router key cannot be obtained, or the account is not provisioned. S1,
   K5, W2 and X1 all stop; everything else continues.
4. `ARCHITECTURE.md` and `PRD.md` contradict each other in a way §0's
   precedence does not resolve **and** both readings produce different data
   models.

Everything else is decided and written to `docs/decisions/`.

---

## 10. Done

v1 is done when:

- Every WP merged; all ten gates green on `main`.
- One real session runs idea to export against the live gateway, and
  `docs/BASELINE.md` reports all five `PRD.md` §10 measures with their sources —
  including any the build missed, stated as a number.
- `provenance-suite` passes with its five assertions enumerated and counted, and
  each has watched its negative control fail.
- The three spike notes are in `docs/spikes/` and every claim in
  `ARCHITECTURE.md` §5.2 and §6.4 that they contradict has a decision file.
- `docs/DECISIONS.md` regenerates clean.
- `bun run preflight` passes against a complete `.env`.
