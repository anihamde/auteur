/** Screen 2 — pick the author, and make the corpus tier honest. */
export const author = {
  back: "Idea",
  /** Why the tier badge exists: a secondary author has neither of these. */
  invalidation:
    "Changing the author later invalidates everything but the idea.",
  next: "Build the style card",
  searchPlaceholder: "Search authors",
  secondaryNote:
    "Secondary-corpus authors are designed for and not built in this version.",
  secondaryReason:
    "No public-domain corpus · no computed prosody, no exemplars",
  subtitle:
    "Search the corpus index. A full-text author has measured prosody and verbatim exemplars; a secondary author has neither.",
  tierFullText: "full-text",
  tierSecondary: "secondary",
  title: "In whose style?",
} as const;
