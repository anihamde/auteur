import { reducedMotionCss } from "@auteur/tokens/conditions";
import { render as testingLibraryRender } from "@testing-library/react";
import type { ReactElement } from "react";

/**
 * Render a component with the design system's ground in place.
 *
 * A component rendered into a bare `<div>` is rendered without the token
 * variables it is styled from, so every colour resolves to nothing and an axe
 * contrast check has no colours to compare. This mounts under a container
 * carrying the theme attribute, which is the state a real page is in.
 *
 * `theme` defaults to the ink ground, because that is what a page shows before
 * any script has run — testing the light ground by default would test the
 * state a reader reaches second.
 */

export type RenderOptions = {
  readonly theme?: "ink" | "light";
  readonly reducedMotion?: boolean;
};

export const renderStyled = (
  element: ReactElement,
  options: RenderOptions = {},
) => {
  const container = document.createElement("div");
  if (options.theme === "light") {
    container.setAttribute("data-theme", "light");
  }
  if (options.reducedMotion === true) {
    // The media query cannot be forced in happy-dom, so the collapse is
    // applied as the stylesheet it generates. That is the same CSS the app
    // ships, which is what keeps this from testing a different thing.
    const style = document.createElement("style");
    style.textContent = reducedMotionCss();
    container.append(style);
  }
  document.body.append(container);
  return testingLibraryRender(element, { container });
};
