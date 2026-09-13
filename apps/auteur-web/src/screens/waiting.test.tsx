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

describe("a stage that finished and produced nothing", () => {
  const finished = (stageId: "clarify" | "outline") => [
    event(1, { role: "question" as const, stageId, type: "stage_start" }),
    event(2, { elapsedMs: 900, stageId, type: "stage_end" }),
  ];

  test("it says so, rather than saying it has not started", () => {
    // `clarify` is asked to judge whether the idea leaves anything open, and
    // "no" is a legitimate answer: it writes no questions, emits `stage_end`,
    // and nothing else ever runs on that step. `done` fell through to the
    // queued sentence, so the screen told the reader the step had not started
    // — under a row whose dot was already green.
    const { container } = render(emptyAt("clarify", finished("clarify")));
    expect(container.textContent).toContain(COPY.shell.stageEmpty);
    expect(container.textContent).not.toContain(COPY.shell.stageQueued);
  });

  test("and the way forward is open", () => {
    // The other half: the one control off this screen was gated on a question
    // existing, so a session clarify had finished with nothing to ask had no
    // way out of the step at all.
    const { container } = render(emptyAt("clarify", finished("clarify")));
    const forward = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === COPY.clarify.generateNow,
    );
    expect(forward?.disabled).toBe(false);
  });

  test("with nothing recorded at all it is still gated", () => {
    // A session whose stream has delivered nothing yet must not offer to skip
    // past a step that has not run.
    const { container } = render(emptyAt("clarify"));
    const forward = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === COPY.clarify.generateNow,
    );
    expect(forward?.disabled).toBe(true);
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
