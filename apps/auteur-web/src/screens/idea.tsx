import { Button, Card, CardHeader } from "@auteur/component-library/core";
import { Field, Select, Textarea } from "@auteur/component-library/forms";
import { COPY } from "@auteur/copy/index";
import { LENGTH_PRESETS, type LengthPreset } from "@auteur/core/session";
import { type ReactElement, useState } from "react";
import type { ScreenProps } from "../shell/app.tsx";

/**
 * Screen 1 — the idea, verbatim, and a length.
 *
 * The Length field's hint is the **resolved** strategy, not the preset's
 * suggestion: §6.6 selects on the model's real `maxOutputTokens` and on the
 * estimated duration, so a `long` preset against a large model may still be
 * `single-call`. Showing the preset's own guess would be showing a choice the
 * pipeline is not going to make.
 */
export const IdeaScreen = ({
  setState,
  transport,
}: ScreenProps): ReactElement => {
  const [idea, setIdea] = useState("");
  const [preset, setPreset] = useState<LengthPreset>("flash");
  const [constraints, setConstraints] = useState("");

  const start = async (): Promise<void> => {
    const session = await transport.client.call("createSession", {
      body: {
        constraints: constraints === "" ? null : constraints,
        idea,
        lengthPreset: preset,
      },
    });
    // Advancing is what moves the wizard. `author` runs no stages, so this
    // enqueues nothing and records where the reader now is — without it the
    // session was created and the screen never changed.
    await transport.client.call("advance", {
      body: { to: "author" },
      params: { id: session.id },
    });
    const view = await transport.client.call("session", {
      params: { id: session.id },
    });
    setState((previous) => ({ ...previous, view }));
  };

  return (
    <Card ground="panel" padding="lg">
      <CardHeader meta={COPY.shell.steps.idea} title={COPY.idea.title} />
      <p>{COPY.idea.subtitle}</p>
      <Field
        hint={COPY.idea.ideaHint}
        htmlFor="idea"
        label={COPY.idea.ideaLabel}
      >
        <Textarea
          counter
          id="idea"
          onChange={(event) => {
            setIdea(event.target.value);
          }}
          prose
          rows={6}
          value={idea}
        />
      </Field>
      <Field
        hint={COPY.idea.strategy[preset]}
        htmlFor="length"
        label={COPY.idea.lengthLabel}
      >
        <Select
          id="length"
          onChange={(event) => {
            setPreset(event.target.value as LengthPreset);
          }}
          options={[...LENGTH_PRESETS]}
          value={preset}
        />
      </Field>
      <Field
        hint={COPY.idea.constraintsHint}
        htmlFor="constraints"
        label={COPY.idea.constraintsLabel}
      >
        <Textarea
          id="constraints"
          onChange={(event) => {
            setConstraints(event.target.value);
          }}
          rows={2}
          value={constraints}
        />
      </Field>
      <Button
        disabled={idea.trim() === ""}
        onClick={() => void start()}
        variant="primary"
      >
        {COPY.idea.next}
      </Button>
    </Card>
  );
};
