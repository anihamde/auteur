/** Screen 3 — the corpus is measured, then the card is read. */
export const research = {
  back: "Author",
  cardLabel: "Style card",
  /** Exemplars are selectable and never editable: they are the corpus's own. */
  exemplarsLabel: "Exemplars",
  exemplarsRule: "selectable, never editable",
  /**
   * The line under the prosody aside.
   *
   * Invariant 1 in one sentence, and it is the sentence the whole product is
   * arguing for, so it is rendered verbatim rather than assembled.
   */
  measuredCaption: "Immutable — a measurement, not an opinion.",
  next: "Ask the questions",
  prosodyLabel: "Computed prosody",
  subtitle:
    "Prosody is computed from the full texts, outside the model. The qualitative half is extracted from selected passages and cited back to them.",
  /** "Reading Borges" — the author's name is the argument. */
  titlePrefix: "Reading",
} as const;
