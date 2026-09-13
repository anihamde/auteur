import { describe, expect, test } from "bun:test";
import { renderStyled } from "@auteur/test-support/render";
import { DEMO_EXEMPLAR_PASSAGES, demoCard } from "../demo/card.ts";
import { demoState, demoTransport } from "../demo/transport.ts";
import { App } from "../shell/app.tsx";

/**
 * The exemplars are the evidence, and the evidence is the passage.
 *
 * A card's exemplar is a `passageId` and a sentence about what it
 * demonstrates; the passage lives in `passages`. The research screen rendered
 * the sentence in the place the passage goes, so every exemplar printed the
 * same line twice — once as the quotation and once as the caption describing
 * it — and the author's prose never reached the screen the product exists to
 * show.
 */

const atResearch = () => {
  const state = demoState();
  const view = state.view;
  if (view === undefined) throw new Error("the demo has no session");
  return renderStyled(
    <App
      initial={{
        ...state,
        view: { ...view, session: { ...view.session, step: "research" } },
      }}
      transport={demoTransport()}
    />,
  );
};

describe("an exemplar quotes the passage, not its own caption", () => {
  test("the quotation is the stored passage", () => {
    const { container } = atResearch();
    const first = Object.values(DEMO_EXEMPLAR_PASSAGES)[0];
    if (first === undefined) throw new Error("the demo has no passages");
    expect(container.textContent).toContain(first);
  });

  test("no block repeats its caption as its quotation", () => {
    // The defect, as a property over every rendered exemplar rather than over
    // the first one.
    const { container } = atResearch();
    for (const figure of container.querySelectorAll("figure")) {
      const quote = figure.querySelector("blockquote")?.textContent ?? "";
      const caption = figure.querySelector("figcaption")?.textContent ?? "";
      expect(quote.length).toBeGreaterThan(0);
      expect(caption).not.toContain(quote);
    }
  });

  test("every one of the card's exemplars renders", () => {
    const { container } = atResearch();
    expect(container.querySelectorAll("figure")).toHaveLength(
      demoCard().exemplars.length,
    );
  });
});

describe("an exemplar whose passage is gone renders nothing", () => {
  test("a block with no quotation is not a weaker exemplar", () => {
    // It is a claim with no evidence, which is the state the screen showed
    // fifteen of. Rendering none is the honest answer.
    const state = demoState();
    const view = state.view;
    if (view === undefined) throw new Error("the demo has no session");
    const { container } = renderStyled(
      <App
        initial={{
          ...state,
          view: {
            ...view,
            exemplarPassages: {},
            session: { ...view.session, step: "research" },
          },
        }}
        transport={demoTransport()}
      />,
    );
    expect(container.querySelectorAll("figure")).toHaveLength(0);
  });
});
