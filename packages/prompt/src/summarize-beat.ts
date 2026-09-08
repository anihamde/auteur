import type { Prompt } from "./versions.ts";

/**
 * `summarize-beat` — continuity between scenes under `sequential-scene`.
 *
 * **Untyped, deliberately.** A summary is prose, and typing it would put a
 * strict-schema requirement on the cheap tier for no gain — the next call
 * inlines this text and never reads a field of it.
 */

export type SummarizeBeatInput = {
  readonly title: string;
  readonly scenesSoFar: readonly string[];
};

export const summarizeBeat: Prompt<SummarizeBeatInput> = {
  build: (input) =>
    [
      `You are keeping continuity for a story called "${input.title}" that is`,
      "being written one scene at a time.",
      "",
      "## What you are given",
      "",
      "The scenes written so far, in order.",
      "",
      input.scenesSoFar
        .map(
          (scene, index) => `### Scene ${(index + 1).toString()}\n\n${scene}`,
        )
        .join("\n\n"),
      "",
      "## What to return",
      "",
      "Plain prose, a few sentences. Not a summary of the plot: the next scene",
      "is written from the beat sheet and does not need to be told what happened.",
      "",
      "## Carry the names, the facts and the unresolved threads",
      "",
      "What the next scene cannot invent for itself: what people and places are",
      "called and how they were spelled, facts established that later prose must",
      "not contradict — the time of year, who knows what, what was already",
      "described — and the threads left open that the story has to come back to.",
      "",
      "Everything else is in the beat sheet. Write what a scene would get wrong",
      "without it.",
    ].join("\n"),
  id: "summarize-beat",
  version: "summarize-beat@1",
};
