import type { StyleCard } from "@auteur/core/style-card";
import { measureWork } from "@auteur/prosody/prosody";
import { putArtifact } from "@auteur/session-store/artifacts";
import { measuresFor } from "@auteur/style-fit/measures";
import { detectDialogueMarker } from "@auteur/text/dialogue-marker";
import type { StageContext } from "./context.ts";

/**
 * `style-fit` — the report, and no model at all.
 *
 * §9's rule in force: the report is a measurement and never an opinion
 * (invariant 1). Nothing here calls a model, so there is no path by which a
 * verdict could be something a model said about the prose rather than something
 * counted in it.
 *
 * The summary is assembled from the verdicts rather than written, for the same
 * reason. A sentence a model produced about how well the draft matched would be
 * the one part of the report a reader could not check.
 */
export const runStyleFit = async (
  context: StageContext,
  card: StyleCard,
  story: { readonly markdown: string },
  inputKey: string,
) => {
  const measures = measuresFor({
    card,
    draft: measureWork(story.markdown, detectDialogueMarker(story.markdown)),
  });

  const failed = measures.filter((measure) => measure.status === "fail");
  const drifted = measures.filter((measure) => measure.status === "drift");
  const summary =
    failed.length === 0 && drifted.length === 0
      ? `All ${measures.length.toString()} measures fall inside the corpus bands.`
      : [
          `${failed.length.toString()} of ${measures.length.toString()} measures fall outside the corpus band`,
          drifted.length === 0
            ? ""
            : `, and ${drifted.length.toString()} drift toward its edge`,
          ".",
        ].join("");

  // No findings, and there is no longer a stage that produces any: `critique`
  // was a model reading the prose against the card, and the reader's note
  // replaced it (decision 0034). This stage invents none of its own — a finding
  // here would be a claim with no measurement behind it — so the report is the
  // measures and the sentence that counts them.
  const report = { findings: [], measures, summary };
  await putArtifact(context.db, {
    body: report,
    inputKey,
    kind: "report",
    sessionId: context.sessionId,
  });

  await context.emit({
    line: summary,
    stageId: context.stage.id,
    type: "stage_detail",
  });
  return report;
};
