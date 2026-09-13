/** Screen 6 — the story, and what you want changed about it. */
export const story = {
  /**
   * The two things this screen does, named for what they do to the story.
   *
   * "Approve" and not "Next": moving on is the approval, and a button that
   * said "Next" would leave the reader looking for the one that accepts it.
   */
  approve: "Approve the story",
  back: "Outline",
  driftLabel: "Drift, live",
  noteHint: "Say what you want changed, in your own words.",
  notePlaceholder: "The middle drags. Cut the second scene to half.",
  notesLabel: "What you asked for",
  rewrite: "Rewrite with these notes",
  /** No ellipsis and no "Analyzing": the stage names itself. */
  title: "The story",
  wordsOf: "of",
} as const;
