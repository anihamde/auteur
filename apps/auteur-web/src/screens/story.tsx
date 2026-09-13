import { Button, Card, CardHeader } from "@auteur/component-library/core";
import { ProsodyStat } from "@auteur/component-library/pipeline";
import { Markdown } from "@auteur/component-library/prose";
import { COPY } from "@auteur/copy/index";
import type { StoredEvent } from "@auteur/core/events";
import { WORD_TARGET } from "@auteur/core/session";
import type { ReactElement } from "react";
import type { ScreenProps } from "../shell/app.tsx";
import { NotePanel } from "./note-panel.tsx";

/**
 * Screen 6 — the prose streams on paper, the drift reads on ink.
 *
 * Both grounds in one view, which is the design's central claim made visible:
 * the artifact is on paper and the instrument measuring it is not. A drift
 * aside on paper would read as part of the story.
 *
 * The same loop as the outline: read it, say what you want changed, read it
 * again. There was a screen between this one and the result that showed a
 * draft's critique and its revision; a reader's sentence replaced both.
 */

/**
 * The deltas of one stage's **latest** run, in order.
 *
 * From the last `stage_start` for that stage, not from the beginning of the
 * log. `story` streams and now runs repeatedly — once to write, once per
 * rewrite — and every delta carries a stage id and no run identity, so joining
 * them all showed the reader the first story immediately followed by the
 * second, at twice the word count.
 */
export const streamedText = (
  events: readonly StoredEvent[],
  stageId: string,
): string => {
  // Narrowed by type before the id is read: only five of the thirteen event
  // shapes carry a stage, and the log holds all thirteen.
  const mine = events.filter((stored) =>
    stored.event.type === "stage_start" || stored.event.type === "stage_delta"
      ? stored.event.stageId === stageId
      : false,
  );
  const started = mine.findLastIndex(
    (stored) => stored.event.type === "stage_start",
  );
  return mine
    .slice(started + 1)
    .flatMap((stored) =>
      stored.event.type === "stage_delta" ? [stored.event.text] : [],
    )
    .join("");
};

/** The most recent reading of each live measure. */
export const latestDrift = (
  events: readonly StoredEvent[],
): Map<
  string,
  { readonly value: number; readonly band: readonly [number, number] }
> => {
  const drift = new Map<
    string,
    { readonly value: number; readonly band: readonly [number, number] }
  >();
  for (const stored of events) {
    if (stored.event.type !== "drift") continue;
    for (const measure of stored.event.measures) {
      drift.set(measure.label, { band: measure.band, value: measure.value });
    }
  }
  return drift;
};

export const StoryScreen = ({
  sessionId,
  setState,
  state,
  transport,
}: ScreenProps): ReactElement => {
  const refresh = async (): Promise<void> => {
    if (sessionId === undefined) return;
    const view = await transport.client.call("session", {
      params: { id: sessionId },
    });
    setState((previous) => ({ ...previous, view }));
  };

  /**
   * Approve it and read the result.
   *
   * Disabled until there is prose: `style-fit` measures the story, and a
   * result screen with nothing to measure is a screen of empty readings.
   */
  const approve = async (): Promise<void> => {
    if (sessionId === undefined) return;
    await transport.client.call("advance", {
      body: { to: "result" },
      params: { id: sessionId },
    });
    await refresh();
  };

  const streamed = streamedText(state.events, "story");
  const stored = state.view?.story?.markdown ?? "";
  const text = streamed === "" ? stored : streamed;
  const drift = latestDrift(state.events);
  const target = WORD_TARGET[state.view?.session.lengthPreset ?? "flash"];
  const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

  return (
    <>
      <CardHeader meta={COPY.shell.steps.story} title={COPY.story.title} />
      <div style={{ display: "flex", gap: "var(--gutter-panel)" }}>
        <Card ground="paper" padding="lg" style={{ flex: "1" }}>
          <Markdown ground="paper" streaming={streamed !== ""}>
            {text}
          </Markdown>
        </Card>
        {/* Ink: a measurement is the instrument, never the artifact. */}
        <Card ground="ink" padding="md" style={{ width: "var(--rail-width)" }}>
          <h3>{COPY.story.driftLabel}</h3>
          <p>
            {words.toLocaleString("en-US")} {COPY.story.wordsOf}{" "}
            {target.toLocaleString("en-US")}
          </p>
          {[...drift.entries()].map(([label, measure]) => (
            <ProsodyStat
              band={measure.band}
              key={label}
              label={label}
              value={measure.value}
            />
          ))}
        </Card>
      </div>

      <NotePanel
        copy={{
          hint: COPY.story.noteHint,
          notesLabel: COPY.story.notesLabel,
          placeholder: COPY.story.notePlaceholder,
          rewrite: COPY.story.rewrite,
        }}
        notes={state.view?.notes ?? []}
        onDone={refresh}
        {...(sessionId === undefined ? {} : { sessionId })}
        stageId="story"
        step="story"
        transport={transport}
      />

      <Button
        disabled={text === ""}
        onClick={() => void approve()}
        variant="primary"
      >
        {COPY.story.approve}
      </Button>
    </>
  );
};
