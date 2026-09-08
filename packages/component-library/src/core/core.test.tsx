import { describe, expect, test } from "bun:test";
import { auditAccessibility } from "@auteur/test-support/audit";
import { renderStyled } from "@auteur/test-support/render";
import { DISABLED, TONES } from "../styles.ts";
import { Badge } from "./badge.tsx";
import { Button, type ButtonVariant } from "./button.tsx";
import { Card, CardHeader } from "./card.tsx";

const VARIANTS: readonly ButtonVariant[] = [
  "primary",
  "secondary",
  "ghost",
  "quiet",
  "danger",
];

describe("Button", () => {
  test("every variant renders and is axe-clean", async () => {
    for (const variant of VARIANTS) {
      const { container } = renderStyled(
        <Button variant={variant}>Continue</Button>,
      );
      expect(container.querySelector("button")).not.toBeNull();
      await auditAccessibility(container);
    }
  });

  test("the focus ring is never suppressed", () => {
    // A component that sets `outline: none` and draws nothing in its place is
    // a keyboard user losing their place.
    const { container } = renderStyled(<Button>Continue</Button>);
    const style =
      container.querySelector("button")?.getAttribute("style") ?? "";
    expect(style).not.toContain("outline: none");
  });

  test("disabled is the handoff's weight, and blocks interaction", () => {
    const { container } = renderStyled(<Button disabled>Continue</Button>);
    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute("style")).toContain(
      `opacity: ${String(DISABLED.opacity)}`,
    );
    expect(button?.getAttribute("style")).toContain("cursor: not-allowed");
  });

  test("loading blocks interaction and says so", async () => {
    const { container } = renderStyled(<Button loading>Continue</Button>);
    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute("aria-busy")).toBe("true");
    await auditAccessibility(container);
  });

  test("href renders a link, not a button styled as one", async () => {
    // A `<button>` styled as a link is not openable in a new tab and is not
    // announced as a link.
    const { container } = renderStyled(<Button href="/sessions">Open</Button>);
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/sessions",
    );
    expect(container.querySelector("button")).toBeNull();
    await auditAccessibility(container);
  });

  test("type defaults to button, not submit", () => {
    // A bare `<button>` inside a form submits it. Every button in this app is
    // an action, and the one that submits says so.
    const { container } = renderStyled(<Button>Continue</Button>);
    expect(container.querySelector("button")?.getAttribute("type")).toBe(
      "button",
    );
  });
});

describe("Badge", () => {
  test("each tone renders its own colour, by meaning", async () => {
    // Tones carry meaning: `cheap|balanced|strong` are tiers, `measured|edited`
    // are provenance. A caller cannot choose a colour.
    for (const tone of Object.keys(TONES) as (keyof typeof TONES)[]) {
      const { container } = renderStyled(<Badge tone={tone}>label</Badge>);
      const span = container.querySelector("span");
      expect(span?.getAttribute("data-tone")).toBe(tone);
      expect(span?.getAttribute("style")).toContain(TONES[tone]);
      await auditAccessibility(container);
    }
  });

  test("mono switches the face for numbers and paths", () => {
    const { container } = renderStyled(<Badge mono>voice.pov</Badge>);
    expect(container.querySelector("span")?.getAttribute("style")).toContain(
      "var(--font-data)",
    );
  });
});

describe("Card", () => {
  test("paper is the artifact ground and ink is the instrument", async () => {
    const paper = renderStyled(<Card ground="paper">prose</Card>);
    expect(
      paper.container.querySelector("div")?.getAttribute("data-ground"),
    ).toBe("paper");
    expect(
      paper.container.querySelector("div")?.getAttribute("style"),
    ).toContain("var(--surface-paper)");

    const ink = renderStyled(<Card>chrome</Card>);
    expect(ink.container.querySelector("div")?.getAttribute("style")).toContain(
      "var(--surface-card)",
    );
    await auditAccessibility(ink.container);
  });

  test("paper carries the drop shadow and ink the hairline", () => {
    // On ink, elevation reads as a lighter hairline; on paper the artifact
    // sits on the desk.
    const paper = renderStyled(<Card ground="paper">x</Card>);
    expect(
      paper.container.querySelector("div")?.getAttribute("style"),
    ).toContain("var(--shadow-paper)");
    const ink = renderStyled(<Card>x</Card>);
    expect(ink.container.querySelector("div")?.getAttribute("style")).toContain(
      "var(--shadow-card)",
    );
  });

  test("an accent draws a top rule at the accent weight", () => {
    const { container } = renderStyled(
      <Card accent="var(--amber-400)">x</Card>,
    );
    expect(container.querySelector("div")?.getAttribute("style")).toContain(
      "var(--rule-accent)",
    );
  });

  test("CardHeader renders the eyebrow above the title", async () => {
    const { container } = renderStyled(
      <CardHeader meta="Research" title="Style card" />,
    );
    expect(container.textContent).toContain("Research");
    expect(container.querySelector("h3")?.textContent).toBe("Style card");
    await auditAccessibility(container);
  });
});
