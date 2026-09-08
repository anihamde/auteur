import { describe, expect, test } from "bun:test";
import { auditAccessibility } from "@auteur/test-support/audit";
import { renderStyled } from "@auteur/test-support/render";
import { Icon, STROKE_WIDTH } from "./icon.tsx";
import { ICON_NAMES, ICON_SIZES, isIconName } from "./names.ts";

/**
 * The closed set, the locked stroke, and the two accessible states.
 */

describe("the set is closed", () => {
  test("every name in the set renders", () => {
    // Not "some names render": a name in the set with no glyph behind it is a
    // component that throws at the one call site that used it.
    for (const name of ICON_NAMES) {
      const { container } = renderStyled(<Icon name={name} />);
      expect(container.querySelector("svg")).not.toBeNull();
    }
  });

  test("a name outside the set is not an icon name", () => {
    expect(isIconName("skull")).toBe(false);
    expect(isIconName("check")).toBe(true);
  });

  test("the set is the size the decision settles it at", () => {
    // Counted from the list rather than written as a literal in two places.
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    expect(ICON_NAMES.length).toBe(10);
  });
});

describe("the stroke is locked and the colour is inherited", () => {
  test("every glyph draws at the design system's weight", () => {
    // A component that could pass its own `strokeWidth` is one that will
    // eventually pass 2 and look wrong beside the others.
    const { container } = renderStyled(<Icon name="check" />);
    expect(container.querySelector("svg")?.getAttribute("stroke-width")).toBe(
      String(STROKE_WIDTH),
    );
  });

  test("no glyph carries a colour of its own", () => {
    // An icon with its own colour is an icon that disappears in one ground.
    for (const name of ICON_NAMES) {
      const { container } = renderStyled(<Icon name={name} />);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("stroke")).toBe("currentColor");
      expect(svg?.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  test("the three sizes are the design's, and size sets both edges", () => {
    for (const size of ICON_SIZES) {
      const { container } = renderStyled(<Icon name="clock" size={size} />);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("width")).toBe(String(size));
      expect(svg?.getAttribute("height")).toBe(String(size));
    }
  });
});

describe("there are two accessible states and no third", () => {
  test("a decorative icon is hidden from a screen reader", async () => {
    // An icon beside a label the reader can already see is noise.
    const { container } = renderStyled(<Icon name="arrow-right" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("role")).toBeNull();
    await auditAccessibility(container);
  });

  test("an icon that is the label carries a name", async () => {
    const { container } = renderStyled(
      <Icon label="Search authors" name="search" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Search authors");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-hidden")).toBeNull();
    await auditAccessibility(container);
  });

  test("it is never both hidden and named", () => {
    // The third state is what ships an icon-only button unlabelled, or an
    // announced arrow beside the word it decorates.
    const { container } = renderStyled(<Icon label="Close" name="x" />);
    const svg = container.querySelector("svg");
    expect(
      svg?.hasAttribute("aria-hidden") && svg.hasAttribute("aria-label"),
    ).toBe(false);
  });
});
