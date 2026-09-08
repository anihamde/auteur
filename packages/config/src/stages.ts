import type { Pipeline } from "@auteur/core/pipeline";

/**
 * The default pipeline, `ARCHITECTURE.md` §6.2.
 *
 * Data rather than code, so an alternative pipeline is a configuration file and
 * not a fork of the engine — which is what `PRD.md` §7 asks for and what makes
 * `single-pass` one `draft` stage plus the two measures it needs, with no
 * engine work at all.
 *
 * Ten stages, three more than the PRD's table, and all three extras are
 * deterministic: fetching and cleaning, computing prosody, and computing the
 * report. Naming them costs nothing and buys the research screen its progress
 * rows and the report its own place in the graph.
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
    {
      id: "style-extract",
      promptId: "style-extract",
      reads: ["work-fetch", "prosody-compute"],
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
      id: "draft",
      promptId: "draft",
      reads: ["style-extract", "outline"],
      role: "draft",
      // The one stage the reader watches produce text.
      streams: true,
      tier: "strong",
      typed: false,
    },
    {
      id: "critique",
      promptId: "critique",
      reads: ["style-extract", "draft"],
      role: "critique",
      streams: false,
      tier: "balanced",
      typed: true,
    },
    {
      id: "revise",
      promptId: "revise",
      reads: ["draft", "critique"],
      role: "revise",
      streams: true,
      tier: "strong",
      typed: true,
    },
    {
      id: "style-fit",
      reads: ["style-extract", "revise"],
      role: "measure",
      streams: false,
      typed: false,
    },
  ],
};

/** The stage ids, in graph order. */
export const STAGE_IDS = DEFAULT_PIPELINE.stages.map((stage) => stage.id);
