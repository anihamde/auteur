import { describe, expect, test } from "bun:test";
import { COPY } from "@auteur/copy/index";
import type { StoredEvent } from "@auteur/core/events";
import { renderStyled } from "@auteur/test-support/render";
import { demoState, demoTransport } from "../demo/transport.ts";
import { App } from "../shell/app.tsx";
import type { SessionState } from "../shell/session-state.ts";

/**
 * A screen with nothing on it says why.
 *
 * Every screen after `research` rendered its artifact or an empty element: an
 * empty paper card where the beat sheet goes, an empty prose card where the
 * story goes, a questions screen with no questions. All three are
 * indistinguishable from a stage that failed and from a stream that stopped
 * delivering — so the only way to tell was to reload, which is what the reader
 * did, every time.
 */

const SESSION = "01a07f00-0000-7000-8000-00000000005e";

const event = (seq: number, body: StoredEvent["event"]): StoredEvent => ({
  createdAt: new Date(1_770_000_000_000 + seq),
  event: body,
  seq,
  sessionId: SESSION,
});

const emptyAt = (
  step: "clarify" | "outline" | "story",
  events: readonly StoredEvent[] = [],
): SessionState => {
  const state = demoState();
  const view = state.view;
  if (view === undefined) throw new Error("the demo has no session");
  return {
    ...state,
    events,
    view: {
      ...view,
      answers: [],
      outline: null,
      session: { ...view.session, step },
      story: null,
    },
  };
};

const render = (state: SessionState) =>
  renderStyled(<App initial={state} transport={demoTransport()} />);

describe("a step with no output says which of three things is true", () => {
  test("nothing has happened yet reads as queued, not as nothing to do", () => {
    const { container } = render(emptyAt("outline"));
    expect(container.textContent).toContain(COPY.shell.stageQueued);
  });

  test("a stage that has started reads as running", () => {
    const { container } = render(
      emptyAt("outline", [
        event(1, { role: "outline", stageId: "outline", type: "stage_start" }),
      ]),
    );
    expect(container.textContent).toContain(COPY.shell.stageRunning);
  });

  test("a stage that failed says so rather than waiting for ever", () => {
    // The worst of the three to render as an empty card: nothing is coming,
    // and the screen that shows nothing looks exactly like the one that is
    // about to show something.
    const { container } = render(
      emptyAt("outline", [
        event(1, { role: "outline", stageId: "outline", type: "stage_start" }),
        event(2, {
          code: "provider_error",
          message: "The gateway refused.",
          stageId: "outline",
          type: "stage_error",
        }),
      ]),
    );
    expect(container.textContent).toContain(COPY.shell.stageFailed);
    expect(container.textContent).toContain("The gateway refused.");
  });
});

describe("every screen that can be empty has one", () => {
  test.each([
    ["clarify", "clarify"],
    ["outline", "outline"],
    ["story", "story"],
  ] as const)("%s waits on its own stage", (step, stageId) => {
    // Each screen names the stage it is waiting for, so the row is about the
    // work the reader is actually blocked on rather than a generic spinner.
    const { container } = render(emptyAt(step));
    expect(
      container.querySelector(`[data-waiting="${stageId}"]`),
    ).not.toBeNull();
  });
});

describe("the row goes when the output arrives", () => {
  test("a beat sheet replaces it rather than sitting beside it", () => {
    const { container } = render(demoState());
    expect(container.querySelector('[data-waiting="outline"]')).toBeNull();
  });
});
