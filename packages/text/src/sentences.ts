import { isAbbreviation } from "./abbreviations.ts";

/**
 * Split prose into sentences.
 *
 * A run of `.`/`!`/`?`/ellipsis followed by whitespace and an opener — a quote,
 * a bracket, or an uppercase letter — with three exceptions
 * (`docs/ARCHITECTURE.md` §4.2):
 *
 *  - a shipped abbreviation list, including single-letter initials;
 *  - a period between digits, so `3.14` and `1935.` in a citation stay whole;
 *  - an ellipsis followed by a lowercase continuation, which is a trailing-off
 *    rather than an ending.
 *
 * Each exception exists because getting it wrong shortens the corpus's mean
 * sentence length rather than failing — a wrong number that looks right.
 */
const TERMINATOR = /[.!?]+|…/;

export const splitSentences = (text: string): readonly string[] => {
  const sentences: string[] = [];
  let start = 0;
  let index = 0;

  while (index < text.length) {
    const char = text[index] ?? "";
    if (!TERMINATOR.test(char)) {
      index += 1;
      continue;
    }

    // Consume the whole run of terminators, plus any closing quote or bracket.
    let end = index;
    while (end < text.length && TERMINATOR.test(text[end] ?? "")) {
      end += 1;
    }
    const runStart = index;
    while (end < text.length && /["'”’)\]]/.test(text[end] ?? "")) {
      end += 1;
    }

    const rest = text.slice(end);
    const after = /^(\s+)([\s\S]?)/.exec(rest);
    if (after === null) {
      index = end;
      continue;
    }
    const next = after[2] ?? "";

    // A period between digits: 3.14, or a year in a reference.
    const previous = text[runStart - 1] ?? "";
    if (
      text[runStart] === "." &&
      /\d/.test(previous) &&
      /\d/.test(rest.trimStart().charAt(0))
    ) {
      index = end;
      continue;
    }

    // An ellipsis trailing into a lowercase continuation is not an ending.
    if (text.slice(runStart, end).includes("…") && /\p{Ll}/u.test(next)) {
      index = end;
      continue;
    }
    if (text.slice(runStart, end).startsWith("...") && /\p{Ll}/u.test(next)) {
      index = end;
      continue;
    }

    // An abbreviation, including a single-letter initial.
    if (text[runStart] === "." && runStart === index) {
      const before = text.slice(start, runStart);
      const lastWord = /([\p{L}.]+)$/u.exec(before)?.[1] ?? "";
      if (isAbbreviation(lastWord.replace(/\.$/, ""))) {
        index = end;
        continue;
      }
    }

    // A real ending needs an opener after the whitespace.
    if (!/["'“‘([\p{Lu}\p{N}]/u.test(next) && next !== "") {
      index = end;
      continue;
    }

    const sentence = text.slice(start, end).trim();
    if (sentence !== "") {
      sentences.push(sentence);
    }
    start = end;
    index = end;
  }

  const tail = text.slice(start).trim();
  if (tail !== "") {
    sentences.push(tail);
  }
  return sentences;
};
