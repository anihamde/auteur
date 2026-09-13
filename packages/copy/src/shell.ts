/**
 * The app shell: the rail, its steps, and the footer rows.
 *
 * Every string the interface renders lives in this package and nowhere else.
 * Not for translation — there is one locale — but because the voice is a stated
 * rule with a test behind it (`rules.test.ts`), and a rule that only applies to
 * the strings someone remembered to put here is not a rule. The lint enumerates
 * the barrel, so a screen that inlines its own sentence is invisible to it and
 * that is the defect the layout prevents.
 */

export const shell = {
  /** Under the wordmark. Lowercase, no terminal period: it is a label. */
  eyebrow: "style from evidence",
  footer: {
    modelsByTier: "by tier",
    modelsLabel: "models",
    /** `n pinned` once anything is overridden. */
    modelsPinned: "pinned",
    routerLabel: "router",
    sessionLabel: "session",
    spendLabel: "spend",
    themeAuto: "Auto",
    themeDark: "Dark",
    themeLabel: "theme",
    themeLight: "Light",
  },
  /**
   * What a screen says while its stage has not produced anything yet.
   *
   * Three states and three sentences, because they call for different things:
   * wait, wait, and look at what went wrong. A single "Loading" would be the
   * same word over a stage that has failed.
   */
  stageFailed: "This step did not finish. The reason is in the row above.",
  stageQueued: "Queued. It starts when the step before it finishes.",
  stageRunning: "Running. This page updates itself when it finishes.",
  stepOf: "Step",
  /** The seven steps, rail order. Sentence case, no terminal period. */
  steps: {
    author: "Author",
    clarify: "Questions",
    idea: "Idea",
    outline: "Outline",
    research: "Research",
    result: "Result",
    story: "Story",
  },
  wordmark: "auteur",
  /** On a button while the request it started is in flight. A label. */
  working: "Working",
} as const;
