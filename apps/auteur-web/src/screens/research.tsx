import { Card, CardHeader } from "@auteur/component-library/core";
import { ProsodyStat, Thinking } from "@auteur/component-library/pipeline";
import { Exemplar } from "@auteur/component-library/prose";
import { COPY } from "@auteur/copy/index";
import type { ReactElement } from "react";
import type { ScreenProps } from "../shell/app.tsx";
import { detailFor, stateFor } from "../shell/session-state.ts";

/** The stages this screen shows a row for, in graph order. */
export const RESEARCH_STAGES = [
  { id: "corpus-select", tier: "balanced" as const },
  { id: "work-fetch", tier: undefined },
  { id: "prosody-compute", tier: undefined },
  { id: "style-extract", tier: "balanced" as const },
];

/**
 * Screen 3 — the corpus is measured, then the card is read.
 *
 * Every detail line comes from a `stage_detail` event and is printed as it
 * arrived. Nothing on this screen composes a sentence from the pipeline's
 * numbers: that would be a second telling of the same story, and the two would
 * disagree the first time a stage changed what it says.
 */
export const ResearchScreen = ({ state }: ScreenProps): ReactElement => {
  const card = state.view?.card ?? undefined;
  return (
    <Card ground="panel" padding="lg">
      <CardHeader
        meta={COPY.shell.steps.research}
        title={`${COPY.research.titlePrefix} ${card?.author.displayName ?? ""}`}
      />
      <p>{COPY.research.subtitle}</p>

      {RESEARCH_STAGES.map((stage) => (
        <Thinking
          detail={detailFor(state.events, stage.id)}
          key={stage.id}
          stage={stage.id}
          state={stateFor(state.events, stage.id)}
          {...(stage.tier === undefined ? {} : { tier: stage.tier })}
        />
      ))}

      {card === undefined ? undefined : (
        <>
          <h3>{COPY.research.prosodyLabel}</h3>
          <ProsodyStat
            label="sentence length"
            unit=" words"
            value={card.prosody.sentenceLength.mean}
          />
          <ProsodyStat
            label="dialogue ratio"
            value={card.prosody.dialogueRatio}
          />
          <ProsodyStat label="mattr" value={card.prosody.mattr} />
          {/* Invariant 1 in one sentence, rendered verbatim rather than
              assembled — it is the sentence the whole product argues for. */}
          <p>{COPY.research.measuredCaption}</p>

          <h3>{COPY.research.exemplarsLabel}</h3>
          <p>{COPY.research.exemplarsRule}</p>
          {card.exemplars.map((exemplar) => (
            <Exemplar
              demonstrates={exemplar.demonstrates}
              key={exemplar.passageId}
              text={exemplar.demonstrates}
              work={exemplar.workTitle}
              {...(exemplar.year === undefined ? {} : { year: exemplar.year })}
            />
          ))}
        </>
      )}
    </Card>
  );
};
