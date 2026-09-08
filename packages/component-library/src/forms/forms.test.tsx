import { describe, expect, test } from "bun:test";
import { auditAccessibility } from "@auteur/test-support/audit";
import { renderStyled } from "@auteur/test-support/render";
import { Field } from "./field.tsx";
import { Input } from "./input.tsx";
import { Select } from "./select.tsx";
import { Textarea } from "./textarea.tsx";

describe("Field", () => {
  test("the label points at its control", async () => {
    const { container } = renderStyled(
      <Field htmlFor="idea" label="Your idea">
        <Input id="idea" />
      </Field>,
    );
    expect(container.querySelector("label")?.getAttribute("for")).toBe("idea");
    await auditAccessibility(container);
  });

  test("axe is clean with a label and clean without one", async () => {
    // Without a `Field`, an `Input` is still a control someone may label
    // elsewhere; the audit must not depend on this component to pass.
    const labelled = renderStyled(
      <Field htmlFor="a" label="Idea">
        <Input id="a" />
      </Field>,
    );
    await auditAccessibility(labelled.container);

    const bare = renderStyled(<Input aria-label="Idea" />);
    await auditAccessibility(bare.container);
  });

  test("the hint is hidden when there is an error", () => {
    // Two lines of guidance where one contradicts the other is how a reader
    // ends up reading the wrong one.
    const { container } = renderStyled(
      <Field error="Too long" hint="A sentence or two" label="Idea">
        <Input />
      </Field>,
    );
    expect(container.textContent).toContain("Too long");
    expect(container.textContent).not.toContain("A sentence or two");
  });

  test("an error is announced, not merely coloured", () => {
    const { container } = renderStyled(
      <Field error="Too long" label="Idea">
        <Input />
      </Field>,
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Too long",
    );
  });

  test("provenance renders beside the label", () => {
    const { container } = renderStyled(
      <Field label="Register" provenance="edited">
        <Input />
      </Field>,
    );
    expect(container.querySelector('[data-origin="edited"]')).not.toBeNull();
  });
});

describe("Input", () => {
  test("invalid is announced as well as coloured", () => {
    const { container } = renderStyled(<Input aria-label="x" invalid />);
    expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  test("an icon reserves padding rather than overlapping the text", () => {
    const { container } = renderStyled(
      <Input aria-label="Search" icon={<span>i</span>} />,
    );
    expect(container.querySelector("input")?.getAttribute("style")).toContain(
      "padding-inline-start: var(--space-8)",
    );
  });
});

describe("Select", () => {
  test("it renders a native select, keyboard-operable without any code", async () => {
    // A listbox built from divs reimplements keyboard operation, screen-reader
    // announcement and touch behaviour, and gets one of them wrong first.
    const { container } = renderStyled(
      <Select aria-label="Preset" options={["flash", "short"]} />,
    );
    const select = container.querySelector("select");
    expect(select?.tagName).toBe("SELECT");
    expect(select?.querySelectorAll("option")).toHaveLength(2);
    await auditAccessibility(container);
  });

  test("options accept both a string and a value/label pair", () => {
    const { container } = renderStyled(
      <Select
        aria-label="Preset"
        options={["flash", { label: "Short story", value: "short" }]}
      />,
    );
    const options = [...container.querySelectorAll("option")];
    expect(options[1]?.value).toBe("short");
    expect(options[1]?.textContent).toBe("Short story");
  });
});

describe("Textarea", () => {
  test("prose switches to the serif face", () => {
    const { container } = renderStyled(<Textarea aria-label="Idea" prose />);
    expect(
      container.querySelector("textarea")?.getAttribute("style"),
    ).toContain("var(--font-prose)");
  });

  test("the counter counts words, and is announced politely", () => {
    // Not on every keystroke: `aria-live="polite"` waits for a pause.
    const { container } = renderStyled(
      <Textarea
        aria-label="Idea"
        counter
        defaultValue="a lighthouse keeper who has never seen the sea"
      />,
    );
    const counter = container.querySelector('[aria-live="polite"]');
    expect(counter?.textContent).toBe("9 words");
  });

  test("an empty field counts zero, not one", () => {
    const { container } = renderStyled(<Textarea aria-label="Idea" counter />);
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe(
      "0 words",
    );
  });
});
