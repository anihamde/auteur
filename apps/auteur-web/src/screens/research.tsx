import { Button, Card, CardHeader } from "@auteur/component-library/core";
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
  // Two rows for what a reader thinks of as one step, and the reason is the
  // platform rather than the design: one call taking the readings *and* the
  // exemplars needed more than the sixty seconds an invocation gets. The rail
  // shows what actually runs, because a row that stood for two stages would
  // sit at "running" through a stage that had already failed.
  { id: "style-fields", tier: "balanced" as const },
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
export const ResearchScreen = ({
  sessionId,
  setState,
  state,
  transport,
}: ScreenProps): ReactElement => {
  const card = state.view?.card ?? undefined;

  /**
   * Ask the questions.
   *
   * Disabled until the card exists: `clarify` reads the style card, so asking
   * before it is built would enqueue a stage with nothing to read. The rail
   * cannot offer this — it only offers steps already behind you — so a screen
   * that shows work finishing has to be the thing that says what is next.
   */
  const next = async (): Promise<void> => {
    if (sessionId === undefined) return;
    await transport.client.call("advance", {
      body: { to: "clarify" },
      params: { id: sessionId },
    });
    const view = await transport.client.call("session", {
      params: { id: sessionId },
    });
    setState((previous) => ({ ...previous, view }));
  };
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

      <Button
        disabled={card === undefined}
        onClick={() => void next()}
        variant="primary"
      >
        {COPY.research.next}
      </Button>
    </Card>
  );
};
