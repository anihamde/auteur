/**
 * The suffix-and-prefix classifier's data.
 *
 * **Declared a proxy, not a dictionary.** No etymological dictionary ships
 * here, so this is a heuristic and `docs/ARCHITECTURE.md` §4.3 requires it to
 * be labelled one wherever it appears — the UI reads
 * `latinate ratio (suffix proxy)`. Both lists are part of `prosody`'s version,
 * so tuning either invalidates every cached card rather than silently changing
 * what the product believes about an author.
 */
export const LATINATE_SUFFIXES: readonly string[] = [
  "tion",
  "sion",
  "ment",
  "ity",
  "ance",
  "ence",
  "ous",
  "ate",
  "ify",
  "ive",
  "able",
  "ible",
  "ary",
  "ory",
  "ual",
  "ial",
  "ic",
  "al",
];

/**
 * Common Germanic words the suffixes above catch.
 *
 * A closed set of short high-frequency words, which is where a suffix rule does
 * its worst damage: `table`, `late` and `give` are among the most frequent
 * words in English, so misclassifying them moves the ratio for every text
 * rather than for a few.
 *
 * The list is exceptions, not a general fix. What decides whether the measure
 * is scored at all is precision against a hand-labelled validation set, and a
 * suffix list tuned until it passes is a fit to 500 labels — which the fixture's
 * own comment says.
 */
export const GERMANIC_EXCEPTIONS: readonly string[] = [
  // -able / -ible
  "table",
  "stable",
  "cable",
  "fable",
  "bible",
  // -ate
  "late",
  "gate",
  "hate",
  "fate",
  "mate",
  "rate",
  "date",
  "state",
  "plate",
  "slate",
  "skate",
  // -ive / -ify
  "give",
  "live",
  "hive",
  "drive",
  "five",
  "wive",
  // -ous / -us
  "house",
  "mouse",
  "louse",
  "blouse",
  // -ment
  "moment",
  // -al
  "shall",
  "small",
  "tall",
  "wall",
  "fall",
  "call",
  "ball",
  "hall",
  "all",
  "real",
  "deal",
  "meal",
  "heal",
  "seal",
  "steal",
  "coal",
  "goal",
  "foal",
  // -ic
  "stick",
  "thick",
  "quick",
  "trick",
  "brick",
  "click",
  "pick",
  "sick",
  "tick",
  "lick",
  "kick",
  // -ity / -ent / -ence
  "city",
  "pity",
  "went",
  "sent",
  "bent",
  "lent",
  "tent",
  "rent",
  "dent",
  "hence",
  "thence",
  "whence",
  "fence",
  // -ance
  "dance",
  "chance",
  "glance",
  // -ary / -ory
  "story",
  "glory",
  "very",
  "every",
  "carry",
  "marry",
  "tarry",
  // -ial / -ual
  "dial",
  "trial",
  "vial",
];
