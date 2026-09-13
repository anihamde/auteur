import { describe, expect, test } from "bun:test";
import { renderStyled } from "@auteur/test-support/render";
import { act } from "react";
import { demoState, demoTransport } from "../demo/transport.ts";
import { App } from "./app.tsx";

/**
 * The one control that changes how the product looks.
 *
 * Every token the interface renders resolves against `data-theme` on the root
 * element. Choosing Light moved the shell's `mode` state and nothing else — the
 * button highlighted, the page stayed dark, and the controller that writes the
 * attribute was created, read once, and dropped.
 */

/** The segmented control is three real radios, so this is the platform's one. */
const toggle = (container: Element, mode: string): HTMLInputElement => {
  const found = container.querySelector(`input[type="radio"][value="${mode}"]`);
  if (found === null) throw new Error(`no theme radio for "${mode}"`);
  return found as HTMLInputElement;
};

describe("choosing a theme writes it where the tokens read it", () => {
  test("Light puts data-theme=light on the root", () => {
    const { container } = renderStyled(
      <App initial={demoState()} transport={demoTransport()} />,
    );
    act(() => {
      toggle(container, "light").click();
    });
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });

  test("Dark puts data-theme=dark on it, so the choice is reversible", () => {
    const { container } = renderStyled(
      <App initial={demoState()} transport={demoTransport()} />,
    );
    act(() => {
      toggle(container, "light").click();
    });
    act(() => {
      toggle(container, "dark").click();
    });
    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });

  test("the mode is recorded beside the resolved theme", () => {
    // `auto` resolves to light or dark by the hour, so the attribute alone
    // cannot say whether the reader chose or the clock did — and a reload that
    // could not tell them apart would forget every explicit choice.
    const { container } = renderStyled(
      <App initial={demoState()} transport={demoTransport()} />,
    );
    act(() => {
      toggle(container, "light").click();
    });
    expect(document.documentElement.dataset["themeMode"]).toBe("light");
  });
});
