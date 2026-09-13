import { describe, expect, test } from "bun:test";
import { COPY } from "@auteur/copy/index";
import { renderStyled } from "@auteur/test-support/render";
import { act } from "react";
import { demoState, demoTransport } from "../demo/transport.ts";
import { App } from "../shell/app.tsx";
import type { SessionState, Transport } from "../shell/session-state.ts";

/**
 * Read it, say what you want changed, read it again.
 *
 * The loop replaced `critique` and `revise` — a model reading the prose
 * against the card and a second model applying what it found, two strong-tier
 * calls spent on a judgement the reader was about to make and could state in a
 * sentence.
 */

const atStep = (step: "outline" | "story"): SessionState => {
  const state = demoState();
  const view = state.view;
  if (view === undefined) throw new Error("the demo has no session");
  return { ...state, view: { ...view, session: { ...view.session, step } } };
};

const recording = (): {
  readonly transport: Transport;
  readonly calls: { name: string; body: unknown }[];
} => {
  const demo = demoTransport();
  const calls: { name: string; body: unknown }[] = [];
  const transport: Transport = {
    ...demo,
    client: {
      call: async (name: string, options?: { body?: unknown }) => {
        calls.push({ body: options?.body, name });
        return demo.client.call(name as never, options as never);
      },
    } as unknown as Transport["client"],
  };
  return { calls, transport };
};

const control = (container: Element, label: string): HTMLButtonElement => {
  const found = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  );
  if (found === undefined) throw new Error(`no button reads "${label}"`);
  return found as HTMLButtonElement;
};

const type = (container: Element, text: string): void => {
  const area = container.querySelector("textarea");
  if (area === null) throw new Error("the screen has no note field");
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(area, text);
  area.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("the rewrite control is a gate, not a dead end", () => {
  test("it is disabled until something is written", () => {
    const { container } = renderStyled(
      <App initial={atStep("outline")} transport={demoTransport()} />,
    );
    expect(control(container, COPY.outline.rewrite).disabled).toBe(true);
  });

  test("whitespace alone does not open it", () => {
    // The contract refuses an empty note, so a control that enabled on spaces
    // would offer a press that comes back 400.
    const { container } = renderStyled(
      <App initial={atStep("outline")} transport={demoTransport()} />,
    );
    act(() => {
      type(container, "   ");
    });
    expect(control(container, COPY.outline.rewrite).disabled).toBe(true);
  });
});

describe("one press files the note and asks for the rewrite", () => {
  test("the note is posted before the advance, in that order", async () => {
    // Reversed, `advance` reads the note set as it was and finds nothing
    // stale — the button does nothing and the screen looks the same.
    const { calls, transport } = recording();
    const { container } = renderStyled(
      <App initial={atStep("outline")} transport={transport} />,
    );
    act(() => {
      type(container, "Start at the letter.");
    });
    await act(async () => {
      control(container, COPY.outline.rewrite).click();
    });

    const named = calls.map((call) => call.name);
    expect(named.indexOf("notes")).toBeGreaterThanOrEqual(0);
    expect(named.indexOf("notes")).toBeLessThan(named.indexOf("advance"));
  });

  test("the note names the stage the reader is looking at", async () => {
    // The story screen's panel filing against `outline` would restale the
    // beat sheet the reader approved and rebuild it from nothing they said.
    const { calls, transport } = recording();
    const { container } = renderStyled(
      <App initial={atStep("story")} transport={transport} />,
    );
    act(() => {
      type(container, "The middle drags.");
    });
    await act(async () => {
      control(container, COPY.story.rewrite).click();
    });

    expect(calls.find((call) => call.name === "notes")?.body).toEqual({
      note: "The middle drags.",
      stageId: "story",
    });
  });

  test("the advance stays on the step, so a rewrite is not a step forward", async () => {
    // Advancing to `result` here would approve a story the reader has just
    // said is wrong.
    const { calls, transport } = recording();
    const { container } = renderStyled(
      <App initial={atStep("story")} transport={transport} />,
    );
    act(() => {
      type(container, "The middle drags.");
    });
    await act(async () => {
      control(container, COPY.story.rewrite).click();
    });

    expect(calls.find((call) => call.name === "advance")?.body).toEqual({
      to: "story",
    });
  });
});

describe("approving is moving on", () => {
  test("the outline's approval advances to the story, not to the result", async () => {
    const { calls, transport } = recording();
    const { container } = renderStyled(
      <App initial={atStep("outline")} transport={transport} />,
    );
    await act(async () => {
      control(container, COPY.outline.approve).click();
    });

    expect(calls.find((call) => call.name === "advance")?.body).toEqual({
      to: "story",
    });
    expect(calls.some((call) => call.name === "notes")).toBe(false);
  });

  test("the story's approval advances to the result", async () => {
    const { calls, transport } = recording();
    const { container } = renderStyled(
      <App initial={atStep("story")} transport={transport} />,
    );
    await act(async () => {
      control(container, COPY.story.approve).click();
    });

    expect(calls.find((call) => call.name === "advance")?.body).toEqual({
      to: "result",
    });
  });
});

describe("the notes already written are on the screen", () => {
  test("a stage's own notes render and another stage's do not", () => {
    // Invariant 3: every step is re-enterable, so a reader who reloads has to
    // see what they already asked for rather than asking for it twice.
    const { container } = renderStyled(
      <App initial={atStep("outline")} transport={demoTransport()} />,
    );
    expect(container.textContent).toContain("Start at the letter");

    const story = renderStyled(
      <App initial={atStep("story")} transport={demoTransport()} />,
    );
    expect(story.container.textContent).not.toContain("Start at the letter");
  });
});
