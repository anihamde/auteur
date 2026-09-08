import { describe, expect, test } from "bun:test";
import { auditAccessibility } from "@auteur/test-support/audit";
import { renderStyled } from "@auteur/test-support/render";
import * as ExemplarModule from "./exemplar.tsx";
import { Exemplar } from "./exemplar.tsx";
import { Markdown, parseBlocks } from "./markdown.tsx";

describe("Markdown", () => {
  test("it defaults to paper, with no prop passed", () => {
    // Story prose sits on paper. A default of ink would put the artifact on
    // the instrument's ground on every call site that forgot.
    const { container } = renderStyled(<Markdown>Hello.</Markdown>);
    expect(container.querySelector("div")?.getAttribute("data-ground")).toBe(
      "paper",
    );
  });

  test("it renders the six block kinds and nothing else", () => {
    const source = [
      "# Landfall",
      "A paragraph with *emphasis* and **weight**.",
      "> A quotation.",
      "- one\n- two",
      "---",
    ].join("\n\n");
    const blocks = parseBlocks(source);
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "paragraph",
      "quote",
      "list",
      "rule",
    ]);
  });

  test("a tag in the source is text, not markup", async () => {
    // Invariant 4 in the other direction: the emitting end is a model.
    const { container } = renderStyled(
      <Markdown>{"The lamp turned <script>alert(1)</script>."}</Markdown>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
    await auditAccessibility(container);
  });

  test("the caret is appended only to the last block, and only while streaming", () => {
    const streaming = renderStyled(
      <Markdown streaming>{"One.\n\nTwo."}</Markdown>,
    );
    expect(
      streaming.container.querySelectorAll('[data-caret="true"]'),
    ).toHaveLength(1);
    const finished = renderStyled(<Markdown>{"One.\n\nTwo."}</Markdown>);
    expect(finished.container.querySelector('[data-caret="true"]')).toBeNull();
  });

  test("the caret is hidden from a screen reader", () => {
    // It is a cursor, not content.
    const { container } = renderStyled(<Markdown streaming>One.</Markdown>);
    expect(
      container
        .querySelector('[data-caret="true"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
  });
});

describe("Exemplar", () => {
  test("it defaults to paper", () => {
    const { container } = renderStyled(
      <Exemplar text="The lamp turned." work="Ward No. 6" />,
    );
    expect(container.querySelector("figure")?.getAttribute("style")).toContain(
      "var(--surface-paper)",
    );
  });

  test("the DOM text equals the prop, byte for byte", () => {
    // An exemplar is evidence. Evidence shortened to fit is no longer the
    // thing that was cited.
    const text =
      "The lamp turned through the fog, and he did not once look at the water — not that night, and not on any night his father had been alive to see.";
    const { container } = renderStyled(
      <Exemplar text={text} work="Ward No. 6" />,
    );
    expect(container.querySelector("blockquote")?.textContent).toBe(text);
  });

  test("no export from this module mutates an exemplar", () => {
    // Enumerated rather than reasoned about: a `truncate` or a `setText` added
    // later fails here.
    const exported = Object.keys(ExemplarModule);
    expect(exported).toEqual(["Exemplar"]);
  });

  test("the citation is rendered, because an uncited passage is not an exemplar", async () => {
    const { container } = renderStyled(
      <Exemplar
        demonstrates="sentence-length floor"
        text="The lamp turned."
        work="Ward No. 6"
        year={1892}
      />,
    );
    expect(container.querySelector("cite")?.textContent).toBe("Ward No. 6");
    expect(container.textContent).toContain("1892");
    expect(container.textContent).toContain("sentence-length floor");
    await auditAccessibility(container);
  });

  test("the include control appears only when selection is offered", () => {
    const without = renderStyled(<Exemplar text="x" work="Ward No. 6" />);
    expect(without.container.querySelector("button")).toBeNull();

    const with_ = renderStyled(
      <Exemplar onSelect={() => undefined} text="x" work="Ward No. 6" />,
    );
    expect(with_.container.querySelector("button")?.textContent).toBe(
      "include",
    );
  });
});
