import { Button, Card, CardHeader } from "@auteur/component-library/core";
import { Markdown } from "@auteur/component-library/prose";
import { COPY } from "@auteur/copy/index";
import type { ReactElement } from "react";
import type { ScreenProps } from "../shell/app.tsx";
import { NotePanel } from "./note-panel.tsx";

/**
 * Screen 5 — the beat sheet, on paper, until you approve it.
 *
 * The loop is the screen: read it, say what you want changed, read it again.
 * Approving is moving on — there is no approval flag anywhere, because a
 * session on the `story` step is a session whose outline was approved, and two
 * facts that say the same thing are two facts that can disagree.
 *
 * The footer caption names the model and tier the **story** will run on, read
 * from what `/api/models` resolved rather than from the tier map. They differ
 * whenever a stage is pinned, and the caption is where a reader finds out
 * before the story rather than after it.
 */
export const OutlineScreen = ({
  onOpenModels,
  sessionId,
  setState,
  state,
  transport,
}: ScreenProps): ReactElement => {
  const outline = state.view?.outline ?? undefined;

  const refresh = async (): Promise<void> => {
    if (sessionId === undefined) return;
    const view = await transport.client.call("session", {
      params: { id: sessionId },
    });
    setState((previous) => ({ ...previous, view }));
  };

  const regenerate = async (): Promise<void> => {
    if (sessionId === undefined) return;
    await transport.client.call("regenerate", {
      body: { stageId: "outline" },
      params: { id: sessionId },
    });
  };

  const approve = async (): Promise<void> => {
    if (sessionId === undefined) return;
    await transport.client.call("advance", {
      body: { to: "story" },
      params: { id: sessionId },
    });
    await refresh();
  };

  return (
    <>
      <CardHeader meta={COPY.shell.steps.outline} title={COPY.outline.title} />
      <p>{COPY.outline.subtitle}</p>
      {/* The artifact ground: a beat sheet is the thing being made. */}
      <Card ground="paper" padding="lg">
        <Markdown ground="paper">
          {outline === undefined
            ? ""
            : [
                `# ${outline.title}`,
                ...outline.beats.map(
                  (beat) => `${beat.index.toString()}. ${beat.text}`,
                ),
              ].join("\n\n")}
        </Markdown>
      </Card>

      <NotePanel
        copy={{
          hint: COPY.outline.noteHint,
          notesLabel: COPY.outline.notesLabel,
          placeholder: COPY.outline.notePlaceholder,
          rewrite: COPY.outline.rewrite,
        }}
        notes={state.view?.notes ?? []}
        onDone={refresh}
        {...(sessionId === undefined ? {} : { sessionId })}
        stageId="outline"
        step="outline"
        transport={transport}
      />

      <div style={{ display: "flex", gap: "var(--inline)" }}>
        <Button onClick={() => void regenerate()} variant="ghost">
          {COPY.outline.regenerate}
        </Button>
        <Button onClick={onOpenModels} variant="ghost">
          {COPY.outline.changeModel}
        </Button>
        <Button
          disabled={outline === undefined}
          onClick={() => void approve()}
          variant="primary"
        >
          {COPY.outline.approve}
        </Button>
      </div>
    </>
  );
};
