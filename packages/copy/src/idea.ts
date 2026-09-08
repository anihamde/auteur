/** Screen 1 — capture the idea verbatim and pick a length. */
export const idea = {
  constraintsHint: "Optional. Anything the draft may not do.",
  constraintsLabel: "Hard constraints",
  ideaHint:
    "Kept verbatim. Nothing here is rewritten before it reaches the pipeline.",
  ideaLabel: "Idea",
  lengthLabel: "Length",
  next: "Choose an author",
  /**
   * The resolved draft strategy, shown as the length field's hint.
   *
   * Length selects a strategy rather than imposing a cap (`PRD.md` §7), and the
   * hint says which one so the choice is visible before it is made.
   */
  strategy: {
    flash: "single-call",
    long: "sequential-scene",
    novelette: "sequential-scene, critique per scene",
    short: "single-call",
  },
  subtitle:
    "One sentence or pages of notes. The questions later are shaped by this and by the author's measured style.",
  title: "What is the story about?",
} as const;
