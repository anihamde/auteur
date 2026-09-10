/**
 * The workspace manifest: every package, the layer it sits in, what it may
 * depend on, and the subpath exports that form its public contract.
 *
 * This file is the contract-first backbone of the build. `new-package.ts`
 * materializes skeletons from it, `check-dependencies.ts` enforces the layering
 * from it, and `api-surface.ts` snapshots the exports named here. Widening a
 * package's public surface means editing this file, which is exactly the review
 * checkpoint `docs/IMPLEMENTATION-PLAN.md` §3.2 asks for.
 *
 * Every package in `docs/ARCHITECTURE.md` §1 is declared here up front, before
 * any of them exists. That is what makes the plan's file partition hold: no
 * later work package creates a `package.json`, so no two branches race to add
 * one.
 */

/**
 * Dependency layers, lowest first, in the order `ARCHITECTURE.md` §1 lists
 * them. A package may depend on packages in its own layer or any lower layer,
 * never a higher one, and never in a cycle.
 */
export const LAYERS = [
  "foundation",
  "infra",
  "store",
  "service",
  "agent",
  "api",
  "ui",
  "test",
  "tooling",
  "app",
] as const;

export type Layer = (typeof LAYERS)[number];

export type PackageSpec = {
  /** Unqualified name; the published name is `@auteur/{name}`. */
  readonly name: string;
  readonly layer: Layer;
  /** One line for the generated README and the package map. */
  readonly description: string;
  /** Unqualified names of workspace packages this package may import. */
  readonly workspaceDeps: readonly string[];
  /**
   * Workspace packages needed only by tests. These land in `devDependencies`,
   * and the dependency gate lets a `test`-layer package in here from any layer:
   * a harness is not a runtime edge, and forbidding it only makes packages
   * duplicate the harness instead of sharing it.
   */
  readonly workspaceDevDeps?: readonly string[];
  /** Catalog (third-party) runtime dependencies. */
  readonly deps: readonly string[];
  /** Catalog (third-party) dev dependencies beyond the shared defaults. */
  readonly devDeps: readonly string[];
  /** Subpath (without the leading "./") to source file, relative to the package. */
  readonly exports: Readonly<Record<string, string>>;
  /** True when the package ships JSX and needs the react tsconfig. */
  readonly react?: boolean;
  /** True when the package has integration tests needing a real Postgres. */
  readonly integration?: boolean;
  /**
   * The package's own `build` script, when it generates sources. Declared here
   * rather than edited into `package.json`, so regenerating a package cannot
   * silently drop it.
   */
  readonly build?: string;
  /** Extra `package.json` scripts beyond the generated test set. */
  readonly scripts?: Readonly<Record<string, string>>;
  /**
   * Modules bun preloads before this package's tests, written into its
   * `bunfig.toml`. A DOM test harness has to run before the test file imports
   * anything that touches a DOM global.
   */
  readonly testPreload?: readonly string[];
  /**
   * Line and function coverage floor, as a fraction. Defaults to 0.8; the
   * packages the implementation plan names as load-bearing carry 0.9.
   */
  readonly coverage?: number;
  /**
   * True for a package `new-package.ts` neither generates nor checks.
   *
   * The two config packages are the only ones: they ship JSON that every other
   * package extends, they have no `src/`, no tests and no coverage floor, and
   * the generated shape — `files: ["src/**\/*"]`, a `test:*` script set, a
   * `tsconfig.json` extending itself — describes none of that. Generating them
   * would mean teaching the generator a second shape it uses twice.
   */
  readonly handWritten?: boolean;
};

export type AppSpec = {
  readonly name: string;
  readonly description: string;
  readonly workspaceDeps: readonly string[];
  readonly workspaceDevDeps?: readonly string[];
  readonly deps: readonly string[];
  readonly devDeps: readonly string[];
  readonly scripts?: Readonly<Record<string, string>>;
  readonly testPreload?: readonly string[];
};

const src = (file: string): string => `./src/${file}`;

export const PACKAGES: readonly PackageSpec[] = [
  // ---------------------------------------------------------------- foundation
  {
    deps: [],
    description: "Time-ordered UUIDv7 identifiers and the branded id types.",
    devDeps: ["fast-check"],
    exports: {
      "branded-ids": src("branded-ids.ts"),
      "new-id": src("new-id.ts"),
      "parse-id": src("parse-id.ts"),
    },
    layer: "foundation",
    name: "ids",
    workspaceDeps: ["errors"],
  },
  {
    deps: ["zod"],
    description:
      "Domain types and their zod schemas. Zero I/O, split by area so concurrent work never shares a file.",
    devDeps: [],
    exports: {
      events: src("events.ts"),
      fit: src("fit.ts"),
      pipeline: src("pipeline.ts"),
      prosody: src("prosody.ts"),
      session: src("session.ts"),
      "style-card": src("style-card.ts"),
    },
    layer: "foundation",
    name: "core",
    workspaceDeps: ["ids"],
  },
  {
    deps: [],
    description: "The error taxonomy and its one HTTP mapping.",
    devDeps: [],
    exports: {
      "auteur-error": src("auteur-error.ts"),
      "error-code": src("error-code.ts"),
      "is-auteur-error": src("is-auteur-error.ts"),
      "to-http-response": src("to-http-response.ts"),
    },
    layer: "foundation",
    name: "errors",
    workspaceDeps: [],
  },
  {
    deps: ["zod"],
    description: "Parse-and-fail-fast environment access, one schema.",
    devDeps: [],
    exports: { env: src("env.ts"), "env-spec": src("env-spec.ts") },
    layer: "foundation",
    name: "env",
    workspaceDeps: ["errors"],
  },
  {
    deps: [],
    description: "Structured JSON logging, one line per record, key redaction.",
    devDeps: [],
    exports: { logger: src("logger.ts") },
    layer: "foundation",
    name: "logger",
    workspaceDeps: [],
  },
  {
    coverage: 0.9,
    deps: [],
    description:
      "Segmentation, Gutenberg cleaning and the cut ladder. Pure, versioned.",
    devDeps: ["fast-check"],
    exports: {
      blocks: src("blocks.ts"),
      clean: src("clean.ts"),
      cut: src("cut.ts"),
      "dialogue-marker": src("dialogue-marker.ts"),
      sentences: src("sentences.ts"),
      snap: src("snap.ts"),
      tokenize: src("tokenize.ts"),
      unwrap: src("unwrap.ts"),
      version: src("version.ts"),
    },
    layer: "foundation",
    name: "text",
    // `core` is same-layer and below in the graph (it depends only on `ids`),
    // so this edge is legal. It is here so `DialogueMarker` has one
    // definition: `text` detects the convention and `core` schematizes it,
    // and two unions that must agree is a drift waiting to happen.
    workspaceDeps: ["core", "errors"],
  },
  {
    coverage: 0.9,
    deps: [],
    description:
      "The deterministic metrics over text's output. No I/O, no model, no clock.",
    devDeps: ["fast-check"],
    exports: {
      bigrams: src("bigrams.ts"),
      dialogue: src("dialogue.ts"),
      latinate: src("latinate.ts"),
      "latinate-gate": src("latinate-gate.ts"),
      lengths: src("lengths.ts"),
      mattr: src("mattr.ts"),
      prosody: src("prosody.ts"),
      punctuation: src("punctuation.ts"),
      version: src("version.ts"),
    },
    layer: "foundation",
    name: "prosody",
    workspaceDeps: ["core", "text"],
  },
  {
    deps: ["@pandacss/dev"],
    description: "The design system's token CSS expressed as a Panda preset.",
    devDeps: [],
    exports: { conditions: src("conditions.ts"), preset: src("preset.ts") },
    layer: "foundation",
    name: "tokens",
    workspaceDeps: [],
  },
  {
    deps: ["lucide-react", "react"],
    description:
      "The closed-set Lucide binding, and the only way to draw an icon.",
    devDeps: ["@types/react"],
    exports: { icon: src("icon.tsx"), names: src("names.ts") },
    layer: "foundation",
    name: "icons",
    react: true,
    testPreload: ["@auteur/test-support/happy-dom"],
    workspaceDeps: ["tokens"],
    workspaceDevDeps: ["test-support"],
  },
  {
    deps: [],
    description:
      "Every user-facing string, one module per screen, with the content rules asserted by test.",
    devDeps: [],
    exports: {
      author: src("author.ts"),
      clarify: src("clarify.ts"),
      draft: src("draft.ts"),
      idea: src("idea.ts"),
      index: src("index.ts"),
      models: src("models.ts"),
      outline: src("outline.ts"),
      research: src("research.ts"),
      result: src("result.ts"),
      shell: src("shell.ts"),
    },
    layer: "foundation",
    name: "copy",
    workspaceDeps: [],
  },
  {
    deps: [],
    description:
      "Presentation rules: elapsed times, counts, money, prosody numbers.",
    devDeps: ["fast-check"],
    exports: {
      elapsed: src("elapsed.ts"),
      "meta-row": src("meta-row.ts"),
      money: src("money.ts"),
      pluralize: src("pluralize.ts"),
      "prosody-value": src("prosody-value.ts"),
      "relative-time": src("relative-time.ts"),
    },
    layer: "foundation",
    name: "formatting",
    workspaceDeps: [],
  },
  {
    deps: [],
    description:
      "Configuration as data: the tier candidate lists and the stage-to-tier map.",
    devDeps: [],
    exports: { stages: src("stages.ts"), tiers: src("tiers.ts") },
    layer: "foundation",
    name: "config",
    workspaceDeps: ["core"],
  },

  // --------------------------------------------------------------------- infra
  {
    deps: ["pg"],
    description:
      "Postgres connection handling, pooled and direct, and SQL primitives. Knows no domain.",
    devDeps: ["@types/pg"],
    exports: { db: src("db.ts"), sql: src("sql.ts") },
    integration: true,
    layer: "infra",
    name: "db",
    // Deliberately does not devDepend on `test-db`, which the rest of the
    // workspace uses. `test-db` is built on `db` and `migrations`, so the edge
    // would be a cycle — and turbo's task graph, unlike the layering check,
    // does not distinguish a devDependency from a runtime one. `db` is the
    // bottom of the stack and its integration suite creates its own database,
    // which is nine lines and needs no schema.
    workspaceDeps: ["env", "errors", "logger"],
  },
  {
    build: "bun run src/build-manifest.ts",
    coverage: 0.9,
    deps: [],
    description:
      "The ordered SQL ledger and the runner that applies it on access.",
    devDeps: [],
    exports: {
      "ensure-schema": src("ensure-schema.ts"),
      manifest: src("generated/manifest.ts"),
    },
    integration: true,
    layer: "infra",
    name: "migrations",
    // No devDependency on `test-db`: that harness exists to apply *these*
    // migrations, so the edge would be a cycle. This package's suites create
    // their own database — see `tests/integration/harness.ts`.
    workspaceDeps: ["db", "errors", "logger"],
  },

  // --------------------------------------------------------------------- store
  {
    deps: [],
    description: "Sessions, answers, artifacts and their staleness.",
    devDeps: [],
    exports: {
      artifacts: src("artifacts.ts"),
      pins: src("pins.ts"),
      questions: src("questions.ts"),
      sessions: src("sessions.ts"),
      "stage-keys": src("stage-keys.ts"),
    },
    integration: true,
    layer: "store",
    name: "session-store",
    workspaceDeps: ["core", "db", "errors", "ids"],
    workspaceDevDeps: ["test-db"],
  },
  {
    deps: [],
    description: "The style-card cache, versioned per author.",
    devDeps: [],
    exports: { cards: src("cards.ts"), overlays: src("overlays.ts") },
    integration: true,
    layer: "store",
    name: "card-store",
    workspaceDeps: ["core", "db", "errors", "ids"],
    workspaceDevDeps: ["test-db"],
  },
  {
    deps: [],
    description:
      "The works and passages cache, keyed by source and cleaner version.",
    devDeps: [],
    exports: {
      authors: src("authors.ts"),
      passages: src("passages.ts"),
      works: src("works.ts"),
    },
    integration: true,
    layer: "store",
    name: "corpus-store",
    workspaceDeps: ["core", "db", "errors", "ids"],
    workspaceDevDeps: ["test-db"],
  },
  {
    coverage: 0.9,
    deps: [],
    description:
      "The durable per-session event log the SSE stream replays from, and the run claim.",
    devDeps: [],
    exports: {
      events: src("events.ts"),
      listen: src("listen.ts"),
      "session-runs": src("session-runs.ts"),
    },
    integration: true,
    layer: "store",
    name: "event-store",
    workspaceDeps: ["core", "db", "errors", "ids"],
    workspaceDevDeps: ["test-db"],
  },
  {
    coverage: 0.9,
    deps: [],
    description:
      "The durable stage chain: enqueue, claim, complete, and the sweep query.",
    devDeps: [],
    exports: { queue: src("queue.ts"), sweep: src("sweep.ts") },
    integration: true,
    layer: "store",
    name: "stage-queue",
    workspaceDeps: ["core", "db", "errors", "ids"],
    workspaceDevDeps: ["test-db"],
  },

  // ------------------------------------------------------------------- service
  {
    deps: [],
    description:
      "Project Gutenberg text fetch and cleaning, work and passage selection.",
    devDeps: [],
    exports: {
      "author-row": src("author-row.ts"),
      authors: src("authors.ts"),
      fetch: src("fetch.ts"),
      passages: src("passages.ts"),
    },
    layer: "service",
    name: "corpus-gutenberg",
    workspaceDeps: ["core", "corpus-store", "errors", "ids", "logger", "text"],
  },
  {
    coverage: 0.9,
    deps: [],
    description:
      "Compose measured and derived halves; version; confidence and card strength.",
    devDeps: [],
    exports: {
      build: src("build.ts"),
      "build-key": src("build-key.ts"),
      resolve: src("resolve.ts"),
      strength: src("strength.ts"),
    },
    layer: "service",
    name: "style-card",
    // Deliberately not `prompt`: that is the agent layer, and this is the
    // service layer. `buildKey` takes the extraction prompt's version as a
    // string and the model id as a string, exactly as `build` takes
    // `Evidence[]` rather than a provider (ARCHITECTURE.md §5.1). Calling the
    // extraction stage is `pipeline`'s job, not this package's.
    workspaceDeps: [
      "card-store",
      "core",
      "corpus-gutenberg",
      "errors",
      "ids",
      "prosody",
    ],
  },
  {
    coverage: 0.9,
    deps: [],
    description: "Bands, verdicts, and the deterministic half of the report.",
    devDeps: [],
    exports: {
      bands: src("bands.ts"),
      edited: src("edited.ts"),
      findings: src("findings.ts"),
      measures: src("measures.ts"),
    },
    layer: "service",
    name: "style-fit",
    workspaceDeps: ["core", "errors", "prosody", "style-card"],
  },
  {
    deps: [],
    description: "Markdown export, and the label no export can omit.",
    devDeps: [],
    exports: { "render-export": src("render-export.ts") },
    layer: "service",
    name: "export",
    workspaceDeps: ["core", "copy", "errors", "formatting", "style-fit"],
  },

  // --------------------------------------------------------------------- agent
  {
    deps: ["zod"],
    description: "The provider-neutral model contract and the registry.",
    devDeps: [],
    exports: {
      descriptor: src("descriptor.ts"),
      provider: src("provider.ts"),
      registry: src("registry.ts"),
      request: src("request.ts"),
    },
    layer: "agent",
    name: "model-provider",
    workspaceDeps: ["core", "errors"],
  },
  {
    coverage: 0.9,
    deps: ["openai", "zod"],
    description:
      "The Ramp Router adapter, speaking the Responses API statelessly.",
    devDeps: [],
    exports: {
      client: src("client.ts"),
      models: src("models.ts"),
      pricing: src("pricing.ts"),
      "provider-errors": src("provider-errors.ts"),
      "responses-request": src("responses-request.ts"),
      "responses-stream": src("responses-stream.ts"),
    },
    layer: "agent",
    name: "provider-router",
    workspaceDeps: ["core", "env", "errors", "logger", "model-provider"],
    workspaceDevDeps: ["test-support"],
  },
  {
    deps: [],
    description: "Every prompt, assembled purely. No I/O, snapshot-tested.",
    devDeps: [],
    exports: {
      clarify: src("clarify.ts"),
      "corpus-select": src("corpus-select.ts"),
      critique: src("critique.ts"),
      draft: src("draft.ts"),
      outline: src("outline.ts"),
      revise: src("revise.ts"),
      "style-extract": src("style-extract.ts"),
      "summarize-beat": src("summarize-beat.ts"),
      versions: src("versions.ts"),
    },
    layer: "agent",
    name: "prompt",
    workspaceDeps: ["core"],
  },
  {
    coverage: 0.9,
    // `clarify.ts` parses the stage's structured output at the boundary, which
    // is invariant 4 and wants a schema rather than a cast.
    deps: ["zod"],
    description:
      "Stage graph, tier resolution, one-stage execution, streaming and usage accounting.",
    devDeps: [],
    exports: {
      clarify: src("clarify.ts"),
      drift: src("drift.ts"),
      engine: src("engine.ts"),
      extract: src("extract.ts"),
      flush: src("flush.ts"),
      pins: src("pins.ts"),
      pipeline: src("pipeline.ts"),
      "resolve-tier": src("resolve-tier.ts"),
      sequential: src("sequential.ts"),
      strategy: src("strategy.ts"),
      usage: src("usage.ts"),
    },
    layer: "agent",
    name: "pipeline",
    workspaceDeps: [
      "config",
      "core",
      "errors",
      "event-store",
      "ids",
      "logger",
      "model-provider",
      "prompt",
      "provider-router",
      "prosody",
      "session-store",
      "stage-queue",
      "style-card",
      "style-fit",
    ],
    workspaceDevDeps: ["test-support"],
  },

  // ----------------------------------------------------------------------- api
  {
    deps: ["zod"],
    description: "One zod source of truth for every route.",
    devDeps: [],
    exports: {
      contract: src("contract.ts"),
      routes: src("routes.ts"),
      transport: src("transport.ts"),
    },
    layer: "api",
    name: "api-contract",
    workspaceDeps: ["core", "errors"],
  },
  {
    deps: ["zod"],
    description: "The typed fetch client, derived from the contract.",
    devDeps: [],
    exports: { client: src("client.ts") },
    layer: "api",
    name: "api-client",
    workspaceDeps: ["api-contract", "core", "errors"],
  },
  {
    coverage: 0.9,
    deps: ["zod"],
    description:
      "The browser half of the SSE stream: cursor, replay, reconnect.",
    devDeps: [],
    exports: { "stream-client": src("stream-client.ts") },
    layer: "api",
    name: "stream-client",
    workspaceDeps: ["api-contract", "core", "errors"],
  },

  // ------------------------------------------------------------------------ ui
  {
    deps: ["@base-ui-components/react", "react", "react-dom"],
    description: "The fifteen design-system primitives.",
    devDeps: [
      "@testing-library/react",
      "@testing-library/user-event",
      "@types/react",
      "@types/react-dom",
      "axe-core",
    ],
    exports: {
      core: src("core/index.ts"),
      forms: src("forms/index.ts"),
      pipeline: src("pipeline/index.ts"),
      prose: src("prose/index.ts"),
      styles: src("styles.ts"),
      theme: src("theme/index.ts"),
    },
    layer: "ui",
    name: "component-library",
    react: true,
    testPreload: ["@auteur/test-support/happy-dom"],
    workspaceDeps: ["copy", "core", "formatting", "icons", "tokens"],
    workspaceDevDeps: ["test-support"],
  },

  // ---------------------------------------------------------------------- test
  {
    deps: [
      "@happy-dom/global-registrator",
      "@testing-library/react",
      "axe-core",
      "react",
    ],
    description:
      "happy-dom preload, a styled render, the axe audit, and the scripted provider.",
    devDeps: ["@types/react"],
    exports: {
      audit: src("audit.ts"),
      conformance: src("conformance.ts"),
      "happy-dom": src("happy-dom.ts"),
      render: src("render.tsx"),
      "scripted-provider": src("scripted-provider.ts"),
    },
    layer: "test",
    name: "test-support",
    react: true,
    workspaceDeps: ["core", "errors", "model-provider", "tokens"],
  },
  {
    deps: ["pg"],
    description:
      "An ephemeral Postgres per test run, migrated by the real runner, with a deterministic fixture.",
    devDeps: ["@types/pg"],
    exports: {
      "seed-session": src("seed-session.ts"),
      "test-db": src("test-db.ts"),
    },
    integration: true,
    layer: "test",
    name: "test-db",
    workspaceDeps: ["db", "ids", "migrations"],
  },
  {
    deps: [],
    description: "CI gate 8: invariant 2, as a build gate rather than a habit.",
    devDeps: [],
    exports: { suite: src("suite.ts") },
    integration: true,
    layer: "test",
    name: "provenance-suite",
    workspaceDeps: ["core", "export", "pipeline", "style-card", "style-fit"],
    workspaceDevDeps: ["test-db"],
  },

  // ------------------------------------------------------------------- tooling
  {
    deps: [],
    description: "The shared TypeScript configurations.",
    devDeps: [],
    exports: {},
    handWritten: true,
    layer: "tooling",
    name: "tsconfig",
    workspaceDeps: [],
  },
  {
    deps: [],
    description: "The shared Biome configuration.",
    devDeps: [],
    exports: {},
    handWritten: true,
    layer: "tooling",
    name: "biome-config",
    workspaceDeps: [],
  },
  {
    deps: ["zod"],
    description:
      "CI gate 9: refuse a catalog version published inside the release-age window.",
    devDeps: [],
    exports: {
      check: src("check.ts"),
      config: src("config.ts"),
      "find-violations": src("find-violations.ts"),
    },
    layer: "tooling",
    name: "dependency-min-age",
    workspaceDeps: [],
  },
];

export const APPS: readonly AppSpec[] = [
  {
    deps: ["@hono/node-server", "hono", "react", "react-dom", "vite", "zod"],
    description:
      "The client and every route. Vite build plus one function per route, on Vercel.",
    devDeps: [
      "@testing-library/react",
      "@testing-library/user-event",
      "@types/react",
      "@types/react-dom",
    ],
    name: "auteur-web",
    scripts: {
      build: "vite build",
      "start:dev": "vite dev",
      "test:coverage": "bun ../../scripts/package-tests.ts coverage",
      "test:types": "tsc --noEmit",
      "test:unit": "bun ../../scripts/package-tests.ts unit",
    },
    testPreload: ["@auteur/test-support/happy-dom"],
    workspaceDeps: [
      "api-client",
      "api-contract",
      "card-store",
      "component-library",
      "config",
      "copy",
      "core",
      "corpus-gutenberg",
      "corpus-store",
      "db",
      "env",
      "errors",
      "event-store",
      "export",
      "formatting",
      "icons",
      "ids",
      "logger",
      "migrations",
      "model-provider",
      "pipeline",
      "prompt",
      "prosody",
      "provider-router",
      "session-store",
      "stage-queue",
      "stream-client",
      "style-card",
      "style-fit",
      "text",
      "tokens",
    ],
    workspaceDevDeps: ["test-db", "test-support"],
  },
];
