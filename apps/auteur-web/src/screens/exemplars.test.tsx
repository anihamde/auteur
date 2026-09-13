import { describe, expect, test } from "bun:test";
import { renderStyled } from "@auteur/test-support/render";
import { DEMO_EXEMPLAR_PASSAGES, demoCard } from "../demo/card.ts";
import { demoState, demoTransport } from "../demo/transport.ts";
import { App } from "../shell/app.tsx";
import { exemplarBlocks } from "./research.tsx";

const A = "01a07f00-0000-7000-8000-000000000001";
const B = "01a07f00-0000-7000-8000-000000000002";

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

describe("two exemplars citing one passage are one block", () => {
  const passages = { [A]: "The lamp turned.", [B]: "The sea did not." };
  const exemplar = (passageId: string, demonstrates: string) => ({
    demonstrates,
    passageId,
    workId: "gutenberg:1",
    workTitle: "Ward No. 6",
    year: 1892,
  });

  test("the quotation renders once, with both readings", () => {
    // Nothing forbids the repeat: the extraction schema bounds the count, and
    // the gateway's strict dialect has no way to say "distinct". Rendered one
    // per exemplar that is two figures carrying a byte-identical quotation
    // under one React key — a duplicate-key warning, and an unmount on every
    // refetch rather than an update.
    const blocks = exemplarBlocks(
      [exemplar(A, "the flat close"), exemplar(A, "plain 'said'")],
      passages,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.demonstrates).toBe("the flat close; plain 'said'");
  });

  test("neither reading is dropped", () => {
    // Keeping the first would take the second off the screen entirely: each is
    // a separate claim about the same evidence.
    const blocks = exemplarBlocks(
      [exemplar(A, "one"), exemplar(A, "two"), exemplar(A, "three")],
      passages,
    );
    expect(blocks[0]?.demonstrates).toBe("one; two; three");
  });

  test("distinct passages stay distinct", () => {
    expect(
      exemplarBlocks([exemplar(A, "one"), exemplar(B, "two")], passages).map(
        (block) => block.passageId,
      ),
    ).toEqual([A, B]);
  });

  test("a missing passage takes its readings with it", () => {
    expect(exemplarBlocks([exemplar("missing", "one")], passages)).toEqual([]);
  });
});
