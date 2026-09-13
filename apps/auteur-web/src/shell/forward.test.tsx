import { describe, expect, test } from "bun:test";
import { COPY } from "@auteur/copy/index";
import type { Step } from "@auteur/core/session";
import { renderStyled } from "@auteur/test-support/render";
import { fireEvent } from "@testing-library/react";
import { demoState, demoTransport } from "../demo/transport.ts";
import { App } from "./app.tsx";

/**
 * Every screen offers a way forward.
 *
 * The rail is not one: it enables only steps **behind** the current one, so a
 * screen without its own forward control is a dead end. Five of the seven were
 * — the wizard could not get past the idea, and every screen's own test passed,
 * because each was asserted against state handed to it rather than state it
 * could reach.
 *
 * `next` in the copy package named these buttons all along. Only two existed.
 */

/** The demo's finished session, viewed from an earlier step. */
const atStep = (step: Step) => {
  const state = demoState();
  const view = state.view;
  if (view === undefined) throw new Error("the demo has no session");
  return {
    ...state,
    view: { ...view, session: { ...view.session, step } },
  };
};

/**
 * The control each screen moves forward with.
 *
 * `author` is absent because its forward control is per search result, and a
 * search needs a network the demo transport does not have. `clarify` and
 * `idea` are below: both gate their control on something the reader supplies,
 * which is a different thing from having none.
 */
const forwardLabels: Partial<Record<Step, string>> = {
  outline: COPY.outline.approve,
  research: COPY.research.next,
  story: COPY.story.approve,
};

const forwardIn = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("main button")].find(
    (button) => button.textContent === label,
  );

describe("no screen is a dead end", () => {
  for (const [step, label] of Object.entries(forwardLabels)) {
    test(`${step} offers "${label}"`, () => {
      const { container } = renderStyled(
        <App initial={atStep(step as Step)} transport={demoTransport()} />,
      );
      const forward = forwardIn(container, label);

      expect(forward).toBeDefined();
      // Present but permanently disabled is the same dead end with a tooltip.
      expect(forward?.disabled).toBe(false);
    });
  }

  test("clarify's button is a gate, not a dead end", () => {
    // Disabled until a round has been asked — skipping questions nobody asked
    // is not a thing to offer. Once one exists it opens, which is what makes
    // it a gate rather than a screen with no way out.
    const empty = atStep("clarify");
    expect(
      forwardIn(
        renderStyled(<App initial={empty} transport={demoTransport()} />)
          .container,
        COPY.clarify.generateNow,
      )?.disabled,
    ).toBe(true);

    const view = empty.view;
    if (view === undefined) throw new Error("the demo has no session");
    const asked = {
      ...empty,
      view: {
        ...view,
        answers: [
          {
            answer: null,
            answerState: "open" as const,
            decision: "whether the keeper speaks",
            dependsOn: [],
            id: "01a08800-0000-7000-8000-000000000001",
            ordinal: 0,
            round: 1,
            sessionId: view.session.id,
            suggestions: ["aloud", "not at all"],
            text: "Does the keeper speak?",
            whyAsked: "The idea leaves the keeper's voice open.",
          },
        ],
      },
    };

    expect(
      forwardIn(
        renderStyled(<App initial={asked} transport={demoTransport()} />)
          .container,
        COPY.clarify.generateNow,
      )?.disabled,
    ).toBe(false);
  });

  test("idea's button is a gate, not a dead end", () => {
    // It refuses an empty idea, which is a gate; typing one opens it. A screen
    // whose only forward control can never enable is the failure this
    // distinguishes from.
    const { container } = renderStyled(
      <App initial={atStep("idea")} transport={demoTransport()} />,
    );
    expect(forwardIn(container, COPY.idea.next)?.disabled).toBe(true);

    const textarea = container.querySelector("textarea");
    if (textarea === null) throw new Error("the idea screen has no textarea");
    fireEvent.change(textarea, { target: { value: "a lighthouse keeper" } });

    expect(forwardIn(container, COPY.idea.next)?.disabled).toBe(false);
  });
});
