import { describe, expect, test } from "bun:test";
import { copyStrings } from "./index.ts";

/**
 * The content rules, as tests over the barrel.
 *
 * `docs/design/wizard-handoff/README.md` §"Copy rules" states them as prose.
 * Prose in a handoff note is a thing someone remembers; a test is a thing that
 * fails. The two lists that follow are the whole of the difference.
 */

const strings = copyStrings();

/** Every string, so a rule that matched nothing is a rule that is not running. */
test("the barrel is enumerable and not empty", () => {
  expect(strings.length).toBeGreaterThan(50);
});

describe("no emoji, ever", () => {
  test.each(strings.map(({ path, text }) => [path, text] as const))(
    "%s",
    (_path, text) => {
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    },
  );
});

describe("no exclamation marks", () => {
  test("nowhere in the barrel", () => {
    // The handoff names no exemption, so there is none here either. If one is
    // ever wanted it belongs in a named list beside this test, not in a
    // loosened regex.
    const offenders = strings.filter(({ text }) => text.includes("!"));
    expect(offenders.map(({ path }) => path)).toEqual([]);
  });
});

describe("the app addresses you, and never says we, I or Let's", () => {
  const FIRST_PERSON = /\b(we|we're|we've|our|ours|us|I|I'm|I've|let's)\b/i;

  test("no first person anywhere", () => {
    // "The app never says 'we', 'I' or 'Let's'." A product that speaks as a
    // person is claiming a relationship it does not have, and this one's whole
    // argument is that it is showing you evidence rather than telling you
    // things.
    const offenders = strings.filter(({ text }) => FIRST_PERSON.test(text));
    expect(offenders.map(({ path }) => path)).toEqual([]);
  });
});

describe("labels do not end in a period; sentences do", () => {
  /** A label is a button, a column head, a tab, a badge, an eyebrow. */
  const LABEL_PATHS =
    /\.(next|back|title|eyebrow|.*Label|tabs\..*|columns\..*|steps\..*|tier.*|strategy\..*|wordmark|themeAuto|themeLight|themeDark|regenerate|changeModel|exportMarkdown|newSession|regenerateSection|generateNow|followUpReveal|skipped|followDefaults|oneModelLabel|paperEyebrow|titlePrefix|searchPlaceholder|exemplarsRule|whyAsked|round|wordsOf|stepOf|pinRefused|secondaryReason|decisions.*|modelsByTier|modelsPinned)$/;

  test("no label carries a terminal period", () => {
    const offenders = strings.filter(
      ({ path, text }) => LABEL_PATHS.test(path) && text.endsWith("."),
    );
    expect(offenders.map(({ path }) => path)).toEqual([]);
  });

  test("every subtitle is a sentence and ends in one", () => {
    // The other direction, so the rule is not satisfied by removing every
    // period in the file.
    const subtitles = strings.filter(({ path }) => path.endsWith(".subtitle"));
    expect(subtitles.length).toBeGreaterThan(4);
    for (const { path, text } of subtitles) {
      expect([path, text.endsWith(".")]).toEqual([path, true]);
    }
  });
});

describe("sentence case, not Title Case", () => {
  const SMALL_WORDS = new Set([
    "a",
    "an",
    "and",
    "at",
    "by",
    "for",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
  ]);

  test("no string capitalises a small word mid-phrase", () => {
    // Title Case is the tell of a UI written by committee, and the handoff
    // asks for sentence case "everywhere, including buttons and table
    // headers".
    //
    // A word that opens a sentence is exempt, which is the whole difficulty:
    // "notes. The questions later" is correct and "Style Of The Evidence" is
    // not, and only the preceding token tells them apart.
    const offenders = strings.filter(({ text }) => {
      const words = text.split(/\s+/);
      return words.some((word, index) => {
        if (index === 0) return false;
        const previous = words[index - 1] ?? "";
        if (/[.?!:;]$/.test(previous)) return false;
        return (
          /^[A-Z][a-z]+$/.test(word) && SMALL_WORDS.has(word.toLowerCase())
        );
      });
    });
    expect(offenders.map(({ text }) => text)).toEqual([]);
  });

  test("and the rule would catch one", () => {
    // A rule nobody has watched reject something is a rule nobody knows works.
    const words = "Style Of The Evidence".split(/\s+/);
    expect(
      words.some(
        (word, index) =>
          index > 0 &&
          /^[A-Z][a-z]+$/.test(word) &&
          SMALL_WORDS.has(word.toLowerCase()),
      ),
    ).toBe(true);
  });
});

describe("the banned words, and why each one is banned", () => {
  const BANNED: readonly { word: RegExp; because: string }[] = [
    { because: "the product is not about the model", word: /\bAI-powered\b/i },
    { because: "it is measurement, and says so", word: /\bmagic(al)?\b/i },
    { because: "writing is not effortless", word: /\beffortless\b/i },
    { because: "nothing here is seamless", word: /\bseamless(ly)?\b/i },
    { because: "nobody is unleashing anything", word: /\bunleash\b/i },
    {
      because: "craft as a verb is marketing",
      word: /\bcrafts?\b|\bcrafted\b/i,
    },
    { because: "it will not be seconds", word: /\bin seconds\b/i },
    { because: "it is never just anything", word: /\bjust\b/i },
    {
      because:
        "the stage names itself: `style-extract`, not a word for waiting",
      word: /\banalyz(e|ing|ed)\b|\banalys(e|ing|ed)\b/i,
    },
  ];

  test.each(BANNED.map((entry) => [entry.word.source, entry] as const))(
    "%s",
    (_source, entry) => {
      const offenders = strings.filter(({ text }) => entry.word.test(text));
      expect([entry.because, offenders.map(({ path }) => path)]).toEqual([
        entry.because,
        [],
      ]);
    },
  );
});

describe("the machinery is named honestly", () => {
  test("the drafting screen says Drafting, with no ellipsis", () => {
    // "Never 'Analyzing…'". An ellipsis is what a UI writes when it has
    // nothing to report; this one reports stage ids and streamed detail lines.
    const offenders = strings.filter(({ text }) => /[…]|\.\.\./.test(text));
    expect(offenders.map(({ path }) => path)).toEqual([]);
  });

  test("the attribution sentence is carried verbatim, not assembled", () => {
    // ARCHITECTURE.md §7.6. It appears on every story view and every export,
    // and `export` takes the label as a required parameter so a document
    // cannot be rendered without it.
    const attribution = strings.find(
      ({ path }) => path === "result.attribution",
    );
    expect(attribution?.text).toContain("AI-generated text");
    expect(attribution?.text).toContain("not written by the author");
  });

  test("the measurement caption states invariant 1 in its own words", () => {
    const caption = strings.find(
      ({ path }) => path === "research.measuredCaption",
    );
    expect(caption?.text).toContain("a measurement, not an opinion");
  });
});
