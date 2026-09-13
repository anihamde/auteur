/** Screen 5 — approve the beat sheet, or say what is wrong with it. */
export const outline = {
  /**
   * Approving is moving on, and the button says so.
   *
   * There is no state behind it: a session on the story step is a session
   * whose outline was approved, which is one fact rather than two that could
   * disagree.
   */
  approve: "Approve and write the story",
  back: "Questions",
  changeModel: "Change model",
  noteHint: "Say what you want changed, in your own words.",
  notePlaceholder: "Start at the letter. The lamp can come later.",
  notesLabel: "What you asked for",
  paperEyebrow: "Outline",
  regenerate: "Regenerate",
  rewrite: "Rewrite with these notes",
  subtitle: "Approve it, or say what you want changed.",
  title: "The beat sheet",
} as const;
