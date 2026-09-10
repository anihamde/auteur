import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildCard } from "./build.ts";
import { buildInput } from "./fixtures.ts";
import { cardStrengthOf, confidenceOf, flattenClaims } from "./strength.ts";

describe("confidence is citation coverage and nothing else", () => {
  test("twelve of fourteen cited", () => {
    expect(confidenceOf(14, 12)).toBeCloseTo(0.857_142_857, 8);
  });

  test("everything cited is 1", () => {
    expect(confidenceOf(14, 14)).toBe(1);
  });

  test("a secondary card returns 0 through the same expression", () => {
    // No branch on `provenance`. A secondary card attempts no derived fields,
    // so the denominator is zero. A provenance check here would be a second
    // place for the two kinds of card to disagree.
    expect(confidenceOf(0, 0)).toBe(0);
  });

  test("the function contains no provenance check", () => {
    // Asserted against the source, because the property is about how it is
    // written and not only about what it returns: a branch that happened to
    // agree today would still be a second place to keep in agreement.
    const source = readFileSync(
      fileURLToPath(new URL("./strength.ts", import.meta.url)),
      "utf8",
    );
    const body = source.slice(source.indexOf("export const confidenceOf"));
    const fn = body.slice(0, body.indexOf("\n\n"));
    expect(fn).not.toContain("provenance");
    expect(fn).not.toContain("secondary");
  });
});

describe("cardStrength is four facts, unblended", () => {
  test("largestWorkShare names the concentration a blend would hide", () => {
    const strength = cardStrengthOf({
      citedDerivedFields: 12,
      derivedFields: 14,
      measuredWords: 214_000,
      wordsPerWork: [130_000, 40_000, 24_000, 20_000],
      workCount: 12,
    });
    expect(strength.largestWorkShare).toBeCloseTo(130_000 / 214_000, 6);
  });

  test("no work is a share of zero, not a division by zero", () => {
    expect(
      cardStrengthOf({
        citedDerivedFields: 0,
        derivedFields: 0,
        measuredWords: 0,
        wordsPerWork: [],
        workCount: 0,
      }).largestWorkShare,
    ).toBe(0);
  });

  test("the counts are carried through, not recomputed", () => {
    // They come from the evidence list, which knows what was attempted; the
    // card only knows what landed.
    const strength = cardStrengthOf({
      citedDerivedFields: 12,
      derivedFields: 14,
      measuredWords: 1,
      wordsPerWork: [1],
      workCount: 1,
    });
    expect([strength.derivedFields, strength.citedDerivedFields]).toEqual([
      14, 12,
    ]);
  });
});

describe("flattenClaims finds the claim-bearing fields and no others", () => {
  const card = buildCard(buildInput());
  const claims = flattenClaims(card);

  test("it finds antiPatterns, which is the one outside a group", () => {
    expect(claims.map((claim) => claim.path)).toContain("antiPatterns");
  });

  test("it does not find author, toolchain or sources", () => {
    // A recursive walk would find them and have to exclude them by shape, and
    // "looks like a claim" is a weaker test than "is in a group that holds
    // claims".
    for (const path of claims.map((claim) => claim.path)) {
      expect(path.startsWith("author")).toBe(false);
      expect(path.startsWith("toolchain")).toBe(false);
      expect(path.startsWith("sources")).toBe(false);
    }
  });

  test("every claim it finds carries an origin, and both kinds appear", () => {
    // `derived` is read from a passage and cites it; `measured` is read from
    // the corpus — an absence or a recurrence — and cannot. A walk that found
    // only one kind would be missing half the card.
    expect(
      claims.every(
        (claim) => claim.origin === "derived" || claim.origin === "measured",
      ),
    ).toBe(true);
    expect(claims.some((claim) => claim.origin === "measured")).toBe(true);
    expect(claims.some((claim) => claim.origin === "derived")).toBe(true);
    expect(claims.length).toBeGreaterThanOrEqual(20);
  });
});
