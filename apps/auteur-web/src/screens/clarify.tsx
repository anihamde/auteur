import { Button, Card, CardHeader } from "@auteur/component-library/core";
import { Field, Input } from "@auteur/component-library/forms";
import { COPY } from "@auteur/copy/index";
import { MAX_QUESTIONS, MAX_ROUNDS } from "@auteur/pipeline/clarify";
import { type ReactElement, useState } from "react";
import type { ScreenProps } from "../shell/app.tsx";

/**
 * Screen 4 — resolve what the idea left open, without ever blocking.
 *
 * "Generate now" is live from the end of round 1 and jumps straight to
 * `outline`. Invariant 3: the wizard never blocks. A reader who has answered
 * nothing still gets a story, and every choice made for them is in the
 * decisions log.
 */
export const ClarifyScreen = ({
  sessionId,
  setState,
  state,
  transport,
}: ScreenProps): ReactElement => {
  const questions = state.view?.answers ?? [];
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const answer = async (
    questionId: string,
    value: string | null,
  ): Promise<void> => {
    if (sessionId === undefined) return;
    const response = await transport.client.call("answers", {
      body: { answer: value, questionId },
      params: { id: sessionId },
    });
    setState((previous) =>
      previous.view === undefined
        ? previous
        : {
            ...previous,
            view: { ...previous.view, answers: response.questions },
          },
    );
  };

  const generateNow = async (): Promise<void> => {
    if (sessionId === undefined) return;
    await transport.client.call("advance", {
      body: { to: "outline" },
      params: { id: sessionId },
    });
    const view = await transport.client.call("session", {
      params: { id: sessionId },
    });
    setState((previous) => ({ ...previous, view }));
  };

  const asked = questions.filter(
    (question) => question.answerState !== "invalidated",
  );
  const rounds = new Set(asked.map((question) => question.round));

  return (
    <Card ground="panel" padding="lg">
      <CardHeader meta={COPY.shell.steps.clarify} title={COPY.clarify.title} />
      <p>{COPY.clarify.subtitle}</p>
      <p>
        {COPY.clarify.round} {rounds.size.toString()}/{MAX_ROUNDS.toString()} ·{" "}
        {asked.length.toString()}/{MAX_QUESTIONS.toString()}
      </p>

      {questions.map((question) => (
        <Card ground="ink" key={question.id} padding="sm">
          <Field
            htmlFor={question.id}
            hint={`${COPY.clarify.whyAsked}: ${question.whyAsked}`}
            label={question.text}
          >
            <Input
              id={question.id}
              onChange={(event) => {
                setDrafts((previous) => ({
                  ...previous,
                  [question.id]: event.target.value,
                }));
              }}
              value={drafts[question.id] ?? question.answer ?? ""}
            />
          </Field>
          <div style={{ display: "flex", gap: "var(--inline)" }}>
            {question.suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                onClick={() => void answer(question.id, suggestion)}
                variant="quiet"
              >
                {suggestion}
              </Button>
            ))}
            <Button
              onClick={() => void answer(question.id, null)}
              variant="ghost"
            >
              {COPY.clarify.skipLabel}
            </Button>
          </div>
          {question.answerState === "skipped" ? (
            <p>{COPY.clarify.skipped}</p>
          ) : undefined}
        </Card>
      ))}

      <p>{COPY.clarify.skipNeverBlocked}</p>
      {/* Live from the end of round 1, not from the end of the budget. */}
      <Button
        disabled={rounds.size === 0}
        onClick={() => void generateNow()}
        variant="primary"
      >
        {COPY.clarify.generateNow}
      </Button>
    </Card>
  );
};
