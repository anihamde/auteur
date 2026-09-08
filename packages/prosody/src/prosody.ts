import type {
  DialogueMarker,
  ProsodyBlock,
  ProsodyTarget,
  WorkProsody,
} from "@auteur/core/prosody";
import {
  combineMarkers,
  detectDialogueMarker,
} from "@auteur/text/dialogue-marker";
import { countWords } from "@auteur/text/tokenize";
import { commonBigrams } from "./bigrams.ts";
import { dialogueRatio } from "./dialogue.ts";
import { latinateRatio } from "./latinate.ts";
import { distribution, paragraphLengths, sentenceLengths } from "./lengths.ts";
import { mattr } from "./mattr.ts";
import { punctuationRates } from "./punctuation.ts";

export type WorkText = { readonly id: string; readonly text: string };

/** Every measure that is one number per work. */
export const measureWork = (
  text: string,
  marker: DialogueMarker,
): WorkProsody => {
  const paragraphs = distribution(paragraphLengths(text));
  return {
    dialogueRatio: dialogueRatio(text, marker).value ?? 0,
    latinateRatio: latinateRatio(text),
    mattr: mattr(text).value,
    paragraphLength: { mean: paragraphs.mean, median: paragraphs.median },
    punctuation: punctuationRates(text),
    sentenceLength: distribution(sentenceLengths(text)),
    words: countWords(text),
  };
};

/**
 * Measure a corpus.
 *
 * The aggregate is computed over the **concatenated text**, not by averaging
 * the per-work numbers. Averaging would weight a 2,000-word sketch equally with
 * a 90,000-word novel, so a card's mean sentence length would move if a short
 * piece were added — which is a fact about the file list rather than about the
 * author.
 *
 * `perWork` is kept beside it because §9.1's bands are the interquartile range
 * *across works* for every measure that is one number per work, and because
 * §4.5 shows the largest single work's share so a card overfitting to one novel
 * is visible rather than averaged into invisibility.
 */
export const measureCorpus = (works: readonly WorkText[]): ProsodyBlock => {
  const markers = works.map((work) => detectDialogueMarker(work.text));
  const marker = combineMarkers(markers);
  const combined = works.map((work) => work.text).join("\n\n");

  const perWork: Record<string, WorkProsody> = {};
  for (const work of works) {
    perWork[work.id] = measureWork(work.text, marker);
  }

  return {
    ...measureWork(combined, marker),
    commonBigrams: [...commonBigrams(combined)],
    dialogueMarker: marker,
    perWork,
  };
};

/**
 * What the draft aims at.
 *
 * In v1 this is the measurement, field for field (§4.6). Nothing writes an
 * overlay; the tension the design's mockup points at — a corpus mean that flash
 * length cannot carry — is handled by a precedence clause in the draft prompt
 * rather than by moving the target, so the report keeps one basis and the drift
 * is visible instead of hidden.
 */
export const targetFrom = (block: ProsodyBlock): ProsodyTarget => ({
  dialogueRatio: block.dialogueRatio,
  latinateRatio: block.latinateRatio,
  mattr: block.mattr,
  punctuation: block.punctuation,
  sentenceLength: block.sentenceLength,
});
