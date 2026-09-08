import { Button, Card, CardHeader } from "@auteur/component-library/core";
import { Markdown } from "@auteur/component-library/prose";
import { COPY } from "@auteur/copy/index";
import type { ReactElement } from "react";
import type { ScreenProps } from "../shell/app.tsx";

/**
 * Screen 5 — the beat sheet, on paper.
 *
 * The footer caption names the model and tier the **draft** will run on, read
 * from what `/api/models` resolved rather than from the tier map. They differ
 * whenever a stage is pinned, and the caption is where a reader finds out
 * before the draft rather than after it.
 */
export const OutlineScreen = ({
  onOpenModels,
  sessionId,
  setState,
  state,
  transport,
}: ScreenProps): ReactElement => {
  const outline = state.view?.outline ?? undefined;

  const regenerate = async (): Promise<void> => {
    if (sessionId === undefined) return;
    await transport.client.call("regenerate", {
      body: { kind: "outline" },
      params: { id: sessionId },
    });
  };

  const draft = async (): Promise<void> => {
    if (sessionId === undefined) return;
    await transport.client.call("advance", {
      body: { to: "draft" },
      params: { id: sessionId },
    });
    const view = await transport.client.call("session", {
      params: { id: sessionId },
    });
    setState((previous) => ({ ...previous, view }));
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
      <div style={{ display: "flex", gap: "var(--inline)" }}>
        <Button onClick={() => void regenerate()} variant="ghost">
          {COPY.outline.regenerate}
        </Button>
        <Button onClick={onOpenModels} variant="ghost">
          {COPY.outline.changeModel}
        </Button>
        <Button onClick={() => void draft()} variant="primary">
          {COPY.outline.next}
        </Button>
      </div>
    </>
  );
};
