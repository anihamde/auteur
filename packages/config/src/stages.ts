import type { Pipeline } from "@auteur/core/pipeline";

/**
 * The default pipeline, `ARCHITECTURE.md` §6.2.
 *
 * Data rather than code, so an alternative pipeline is a configuration file and
 * not a fork of the engine — which is what `PRD.md` §7 asks for and what makes
 * `single-pass` one `story` stage plus the two measures it needs, with no
 * engine work at all.
 *
 * Nine stages. Three of them are deterministic — fetching and cleaning,
 * computing prosody, and computing the report — which costs nothing to name and
 * buys the research screen its progress rows and the report its own place in
 * the graph.
 *
 * **There is no `critique` and no `revise`.** They were an automated pass over
 * the prose: a model read the draft against the card, a second model applied
 * what it found, and the reader saw the result. Two model calls of the
 * strongest tier, spent on a judgement the reader was about to make anyway and
 * could state in a sentence. `revision_notes` is what replaced them — the
 * reader says what is wrong in their own words and the stage writes the story
 * again. Decision 0034.
 *
 * **`reads` is the whole of §7.5's staleness.** Changing an answer changes the
 * answer set, so `outline` and everything downstream goes stale and the card
 * does not; changing the author restales everything after `corpus-select` and
 * the idea survives. None of that is coded — it falls out of this list.
 */
export const DEFAULT_PIPELINE: Pipeline = {
  id: "default",
  name: "Default",
  stages: [
    {
      id: "corpus-select",
      promptId: "corpus-select",
      reads: [],
      role: "research",
      streams: false,
      // Conservative until WP-X0 measures the catalogue: this stage is typed,
      // and §4/S1 ships `balanced` rather than `cheap` so the pipeline is
      // correct if no cheap model accepts a strict schema, and merely more
      // expensive than necessary if one does.
      tier: "balanced",
      typed: true,
    },
    {
      id: "work-fetch",
      reads: ["corpus-select"],
      role: "fetch",
      streams: false,
      typed: false,
    },
    {
      id: "prosody-compute",
      reads: ["work-fetch"],
      role: "measure",
      streams: false,
      typed: false,
    },
    // The card is read in two passes, and the reason is the platform: one call
    // returning twenty-two readings *and* fifteen exemplars needed more than
    // the sixty seconds an invocation gets, and timed out on the deployment
    // every time. `build-vercel.ts` states the rule this follows — a stage that
    // needs longer than a minute is a stage to split rather than a limit to
    // raise. Decision 0031 has the measurements.
    {
      id: "style-fields",
      promptId: "style-fields",
      reads: ["work-fetch", "prosody-compute"],
      role: "research",
      streams: false,
      tier: "balanced",
      typed: true,
    },
    {
      id: "style-extract",
      promptId: "style-extract",
      // `style-fields` and not only the two it read: an exemplar says what a
      // passage demonstrates, and what it demonstrates is one of the readings.
      // Naming it here is also what makes §7.5 restale the exemplars when the
      // readings change, which is the correct answer and not one anything codes.
      reads: ["work-fetch", "prosody-compute", "style-fields"],
      role: "research",
      streams: false,
      tier: "balanced",
      typed: true,
    },
    {
      id: "clarify",
      promptId: "clarify",
      reads: ["style-extract"],
      role: "question",
      streams: false,
      tier: "balanced",
      typed: true,
    },
    {
      id: "outline",
      promptId: "outline",
      reads: ["style-extract", "clarify"],
      role: "outline",
      streams: false,
      tier: "balanced",
      typed: true,
    },
    {
      id: "story",
      promptId: "story",
      // The outline, and the notes the reader wrote about the story that was
      // written from it. `reads` is what makes a note restale this stage: the
      // note set is a direct input (`_staleness.ts`), so filing one and
      // pressing the button writes the story again with the note in the prompt.
      reads: ["style-extract", "outline"],
      role: "draft",
      // The one stage the reader watches produce text.
      streams: true,
      tier: "strong",
      typed: false,
    },
    {
      id: "style-fit",
      reads: ["style-extract", "story"],
      role: "measure",
      streams: false,
      typed: false,
    },
  ],
};

/** The stage ids, in graph order. */
export const STAGE_IDS = DEFAULT_PIPELINE.stages.map((stage) => stage.id);
