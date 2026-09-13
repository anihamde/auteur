import { Button, Card, CardHeader } from "@auteur/component-library/core";
import { ProsodyStat, Thinking } from "@auteur/component-library/pipeline";
import { Exemplar } from "@auteur/component-library/prose";
import { COPY } from "@auteur/copy/index";
import type { Exemplar as CardExemplar } from "@auteur/core/style-card";
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
 * One block per passage, with every reading that passage demonstrates.
 *
 * Two exemplars may cite the same passage — nothing forbids it: the extraction
 * schema bounds the count and the gateway's strict dialect has no way to say
 * "distinct", so a model choosing fifteen passages out of twenty and repeating
 * one is an ordinary answer. Rendered one per exemplar that is two figures
 * carrying a byte-identical quotation under one React key, which is a duplicate
 * key warning and an unmount on every refetch.
 *
 * So the passage is the block and the readings are its caption. That is also
 * the truer shape: the evidence is the passage, and what it demonstrates is
 * what was read from it.
 *
 * A passage that is missing renders nothing at all. A block whose evidence is
 * the sentence describing the evidence is a claim with none, which is what this
 * screen showed fifteen of.
 */
export const exemplarBlocks = (
  exemplars: readonly CardExemplar[],
  passages: Readonly<Record<string, string>>,
): {
  readonly passageId: string;
  readonly demonstrates: string;
  readonly text: string;
  readonly workTitle: string;
  readonly year?: number;
}[] => {
  const byPassage = new Map<
    string,
    {
      passageId: string;
      demonstrates: string;
      text: string;
      workTitle: string;
      year?: number;
    }
  >();
  for (const exemplar of exemplars) {
    const text = passages[exemplar.passageId];
    if (text === undefined || text === "") continue;
    const seen = byPassage.get(exemplar.passageId);
    if (seen === undefined) {
      byPassage.set(exemplar.passageId, {
        demonstrates: exemplar.demonstrates,
        passageId: exemplar.passageId,
        text,
        workTitle: exemplar.workTitle,
        ...(exemplar.year === undefined ? {} : { year: exemplar.year }),
      });
      continue;
    }
    // Joined rather than replaced: each reading is a separate claim about the
    // same evidence, and keeping one would drop the other from the screen.
    seen.demonstrates = `${seen.demonstrates}; ${exemplar.demonstrates}`;
  }
  return [...byPassage.values()];
};

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
  const passages = state.view?.exemplarPassages ?? {};

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
          {/* Spaced, because fifteen paper cards flush against one another
              read as one cream field rather than fifteen pieces of evidence.
              The gap is what makes the count legible. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--stack)",
            }}
          >
            {exemplarBlocks(card.exemplars, passages).map((block) => (
              <Exemplar
                demonstrates={block.demonstrates}
                key={block.passageId}
                text={block.text}
                work={block.workTitle}
                {...(block.year === undefined ? {} : { year: block.year })}
              />
            ))}
          </div>
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
