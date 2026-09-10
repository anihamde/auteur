import { Button, Card, CardHeader } from "@auteur/component-library/core";
import { ProsodyStat } from "@auteur/component-library/pipeline";
import { Markdown } from "@auteur/component-library/prose";
import { COPY } from "@auteur/copy/index";
import type { StoredEvent } from "@auteur/core/events";
import { WORD_TARGET } from "@auteur/core/session";
import type { ReactElement } from "react";
import type { ScreenProps } from "../shell/app.tsx";

/**
 * Screen 6 — the prose streams on paper, the drift reads on ink.
 *
 * Both grounds in one view, which is the design's central claim made visible:
 * the artifact is on paper and the instrument measuring it is not. A drift
 * aside on paper would read as part of the story.
 */

/** The deltas so far, in order. */
export const streamedText = (events: readonly StoredEvent[]): string =>
  events
    .flatMap((stored) =>
      stored.event.type === "stage_delta" ? [stored.event.text] : [],
    )
    .join("");

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

export const DraftScreen = ({
  sessionId,
  setState,
  state,
  transport,
}: ScreenProps): ReactElement => {
  /**
   * Read the result.
   *
   * Disabled until there is prose: `style-fit` measures the draft, and a
   * result screen with nothing to measure is a screen of empty readings.
   */
  const next = async (): Promise<void> => {
    if (sessionId === undefined) return;
    await transport.client.call("advance", {
      body: { to: "result" },
      params: { id: sessionId },
    });
    const view = await transport.client.call("session", {
      params: { id: sessionId },
    });
    setState((previous) => ({ ...previous, view }));
  };

  const streamed = streamedText(state.events);
  const stored = state.view?.story?.markdown ?? "";
  const text = streamed === "" ? stored : streamed;
  const drift = latestDrift(state.events);
  const target = WORD_TARGET[state.view?.session.lengthPreset ?? "flash"];
  const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

  return (
    <>
      <CardHeader meta={COPY.shell.steps.draft} title={COPY.draft.title} />
      <div style={{ display: "flex", gap: "var(--gutter-panel)" }}>
        <Card ground="paper" padding="lg" style={{ flex: "1" }}>
          <Markdown ground="paper" streaming={streamed !== ""}>
            {text}
          </Markdown>
        </Card>
        {/* Ink: a measurement is the instrument, never the artifact. */}
        <Card ground="ink" padding="md" style={{ width: "var(--rail-width)" }}>
          <h3>{COPY.draft.driftLabel}</h3>
          <p>
            {words.toLocaleString("en-US")} {COPY.draft.wordsOf}{" "}
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

      <Button
        disabled={text === ""}
        onClick={() => void next()}
        variant="primary"
      >
        {COPY.draft.next}
      </Button>
    </>
  );
};
