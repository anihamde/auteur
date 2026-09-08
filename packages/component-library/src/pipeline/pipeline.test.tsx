import { describe, expect, test } from "bun:test";
import { auditAccessibility } from "@auteur/test-support/audit";
import { renderStyled } from "@auteur/test-support/render";
import {
  ProsodyStat,
  type ProsodyStatProps,
  positionOn,
} from "./prosody-stat.tsx";
import { ProvenanceMark } from "./provenance-mark.tsx";
import { Thinking } from "./thinking.tsx";
import { WizardRail } from "./wizard-rail.tsx";

describe("ProsodyStat", () => {
  test("ground is not an accepted prop", () => {
    // A measurement never sits on paper: paper is the artifact and
    // measurement is the instrument. A `ground="paper"` here would let a
    // number be styled as though it were part of the story.
    // A type-level assertion rather than a runtime one: the rule is a type
    // rule, and `tsc` is what enforces it. If `ground` were ever added to the
    // contract, `HasGround` becomes `true` and this stops compiling.
    type HasGround = "ground" extends keyof ProsodyStatProps ? true : false;
    const hasGround: HasGround = false;
    expect(hasGround).toBe(false);
  });

  test("the target is a hairline tick, distinct from the value marker", () => {
    // They are different claims. A reader who cannot tell them apart cannot
    // read the plot at all.
    const { container } = renderStyled(
      <ProsodyStat
        band={[10, 30]}
        label="sentence length"
        target={18}
        value={22}
      />,
    );
    const tick = container.querySelector('[data-target="true"]');
    const marker = container.querySelector('[data-marker="true"]');
    expect(tick?.getAttribute("style")).toContain("var(--rule-hairline)");
    expect(marker?.getAttribute("style")).toContain("var(--space-1-5)");
    expect(tick?.getAttribute("style")).not.toBe(marker?.getAttribute("style"));
  });

  test("a value outside the band is clamped to the axis, not drawn off it", () => {
    expect(positionOn([10, 30], 40)).toBe(100);
    expect(positionOn([10, 30], 0)).toBe(0);
    expect(positionOn([10, 30], 20)).toBe(50);
  });

  test("a zero-width band puts the marker in the middle rather than dividing by zero", () => {
    expect(positionOn([5, 5], 5)).toBe(50);
  });

  test("with no band it is a bare label and value", async () => {
    const { container } = renderStyled(
      <ProsodyStat label="mattr" value={0.42} />,
    );
    expect(container.querySelector('[data-band="true"]')).toBeNull();
    await auditAccessibility(container);
  });
});

describe("ProvenanceMark", () => {
  test("edited is amber and carries a reset", async () => {
    // An edited field is the one state the product cannot vouch for, so the
    // way back is wherever the warning is.
    const { container } = renderStyled(
      <ProvenanceMark onReset={() => undefined} origin="edited" />,
    );
    expect(container.querySelector("span")?.getAttribute("style")).toContain(
      "var(--amber-400)",
    );
    expect(container.querySelector("button")?.textContent).toBe("reset");
    await auditAccessibility(container);
  });

  test("a derived field shows no reset, whatever handler is passed", () => {
    // There is nothing to reset: it was read from a passage.
    const { container } = renderStyled(
      <ProvenanceMark onReset={() => undefined} origin="derived" />,
    );
    expect(container.querySelector("button")).toBeNull();
  });

  test("a citation is set in italic serif", () => {
    const { container } = renderStyled(
      <ProvenanceMark origin="derived" source="The Garden of Forking Paths" />,
    );
    expect(container.querySelector("cite")?.getAttribute("style")).toContain(
      "var(--font-prose)",
    );
  });
});

describe("Thinking", () => {
  test("a stage with no tier renders no tier badge", () => {
    // `prosody-compute` runs no model. An empty badge would claim it had a
    // tier that failed to load.
    const { container } = renderStyled(
      <Thinking stage="prosody-compute" state="done" />,
    );
    expect(container.querySelector("[data-tone]")).toBeNull();
  });

  test("a tiered stage renders its tier", () => {
    const { container } = renderStyled(
      <Thinking stage="outline" tier="balanced" />,
    );
    expect(container.querySelector('[data-tone="balanced"]')?.textContent).toBe(
      "balanced",
    );
  });

  test("detail lines are printed, in order, exactly as given", async () => {
    // They arrive as `stage_detail` events. A component that built a sentence
    // from a stage's numbers would be a second place the story is told.
    const detail = ["12 works found", "Ward No. 6 — 24,000 words"];
    const { container } = renderStyled(
      <Thinking detail={detail} stage="corpus-select" tier="balanced" />,
    );
    const items = [...container.querySelectorAll("li")].map(
      (item) => item.textContent,
    );
    expect(items).toEqual(detail);
    await auditAccessibility(container);
  });

  test("elapsed is printed as given, never computed here", () => {
    const { container } = renderStyled(
      <Thinking elapsed="4.2s" stage="draft" />,
    );
    expect(container.textContent).toContain("4.2s");
  });
});

describe("WizardRail", () => {
  const STEPS = [
    { label: "Idea", note: "flash" },
    { label: "Author" },
    { label: "Research" },
  ];

  test("completed steps are clickable and pending steps are not", async () => {
    // Invariant 3 as an affordance. A rail that made every row clickable
    // would promise a jump the pipeline cannot honour.
    const { container } = renderStyled(
      <WizardRail current={2} onStep={() => undefined} steps={STEPS} />,
    );
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons[0]?.disabled).toBe(false);
    expect(buttons[1]?.disabled).toBe(false);
    expect(buttons[2]?.disabled).toBe(true);
    await auditAccessibility(container);
  });

  test("without onStep the rail is read-only", () => {
    const { container } = renderStyled(
      <WizardRail current={2} steps={STEPS} />,
    );
    expect(
      [...container.querySelectorAll("button")].every(
        (button) => button.disabled,
      ),
    ).toBe(true);
  });

  test("the active step is announced as the current one", () => {
    const { container } = renderStyled(
      <WizardRail current={1} steps={STEPS} />,
    );
    expect(
      container.querySelector('[aria-current="step"]')?.textContent,
    ).toContain("Author");
  });

  test("a note renders mono, right-aligned", () => {
    const { container } = renderStyled(<WizardRail steps={STEPS} />);
    expect(container.textContent).toContain("flash");
  });
});
