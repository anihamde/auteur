import axe from "axe-core";

/**
 * The axe audit, as an assertion rather than a report.
 *
 * `ARCHITECTURE.md` §11: every component ships an axe-clean render. A helper
 * that returned violations for a caller to inspect would be a helper whose
 * result a caller can forget to look at, so this throws — with the rule ids and
 * the offending markup in the message, because "1 violation" is not a defect
 * anyone can fix.
 *
 * Colour-contrast is **not** disabled. It is the rule most often turned off,
 * and it is the one this design system's two grounds most need: a token that
 * resolves to nothing produces a transparent foreground, and contrast is what
 * notices.
 */
export const auditAccessibility = async (element: Element): Promise<void> => {
  const results = await axe.run(element, {
    resultTypes: ["violations"],
  });
  if (results.violations.length === 0) return;

  const detail = results.violations
    .map(
      (violation) =>
        `${violation.id}: ${violation.help}\n  ${violation.nodes
          .map((node) => node.html)
          .join("\n  ")}`,
    )
    .join("\n");
  throw new Error(
    `axe found ${results.violations.length} violation(s):\n${detail}`,
  );
};
