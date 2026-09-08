/** Screen 4 — resolve what the idea left open, without ever blocking. */
export const clarify = {
  back: "Research",
  /** The follow-up is offered, never imposed. */
  followUpReveal: "Show it",
  generateNow: "Generate now",
  next: "Outline",
  round: "round",
  skipLabel: "You decide",
  /**
   * Every skip says it is never blocked, and the footer says it again where a
   * reader who skipped a question is looking.
   */
  skipNeverBlocked: "Skipping is never blocked.",
  skipped: "Skipped — model chooses",
  subtitle:
    "Answer them, or skip and the model chooses. Every choice it makes on your behalf is recorded in the decisions log.",
  title: "Some things are still ambiguous",
  /** A question that cannot name the decision it resolves is not asked. */
  whyAsked: "Why asked",
} as const;
