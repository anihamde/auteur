import { describe, expect, test } from "bun:test";
import type { CardOverlay } from "@auteur/core/style-card";
import { buildCard } from "./build.ts";
import { buildInput } from "./fixtures.ts";
import { overlaidPaths, resolveCard } from "./resolve.ts";

const card = buildCard(buildInput());

const overlay = (fields: CardOverlay["fields"]): CardOverlay => ({
  cardId: card.id,
  fields,
  sessionId: "c1c9f2e0-0000-7000-8000-abcdefabcdef",
});

describe("no overlay is the card itself", () => {
  test("resolveCard returns it unchanged, and no paths", () => {
    const resolved = resolveCard(card);
    expect(resolved.card).toBe(card);
    expect(resolved.overlaidPaths).toEqual([]);
  });
});

describe("an overlay changes one field and nothing else", () => {
  const edited = resolveCard(
    card,
    overlay({
      "voice.narratorDistance": {
        origin: "edited",
        reason: "the reader reworded it",
        value: "closer than the corpus average",
      },
    }),
  );

  test("the field comes back edited, with the reader's value", () => {
    expect(edited.card.voice.narratorDistance.origin).toBe("edited");
    expect(edited.card.voice.narratorDistance.value).toBe(
      "closer than the corpus average",
    );
  });

  test("every other field is unchanged", () => {
    expect(edited.card.voice.pov).toEqual(card.voice.pov);
    expect(edited.card.diction).toEqual(card.diction);
    expect(edited.card.structure).toEqual(card.structure);
  });

  test("the canonical card is not mutated", () => {
    // borges@3 is one row shared by every session that resolved it. A session
    // that reworded its voice line must not change what another session sees.
    expect(card.voice.narratorDistance.origin).toBe("derived");
    expect(card.voice.narratorDistance.value).toBe("far");
  });

  test("the overlaid paths name exactly what changed", () => {
    expect(edited.overlaidPaths).toEqual(["voice.narratorDistance"]);
  });

  test("the edit sits beside the provenance rather than erasing it", () => {
    // Invariant 2 survives an edit rather than being suspended by one: the
    // citation the card was built with is still there under the new value.
    expect(edited.card.voice.narratorDistance.citation).toEqual(
      card.voice.narratorDistance.citation,
    );
  });
});

describe("what an overlay may not touch", () => {
  test("a measurement is refused, because it is not an opinion", () => {
    // Invariant 1. An overlay is an opinion by definition, and prosody is the
    // thing the draft is compared against.
    const resolved = resolveCard(
      card,
      overlay({
        "prosody.sentenceLength": { origin: "edited", value: { mean: 12 } },
      }),
    );
    expect(resolved.overlaidPaths).toEqual([]);
    expect(resolved.card.prosody).toEqual(card.prosody);
  });

  test("cardStrength, toolchain and author are refused too", () => {
    const resolved = resolveCard(
      card,
      overlay({
        "author.displayName": { origin: "edited", value: "someone else" },
        "cardStrength.workCount": { origin: "edited", value: 99 },
        "toolchain.cleaner": { origin: "edited", value: "clean-fake" },
      }),
    );
    expect(resolved.overlaidPaths).toEqual([]);
  });
});

describe("an overlay outlives the card it was written against", () => {
  test("a path the card does not carry is ignored, not added", () => {
    // A session pinned to borges@3 whose card is later rebuilt as @4 with a
    // renamed field. Inventing the field would put a claim on the card that
    // the schema never described and the report cannot measure.
    const resolved = resolveCard(
      card,
      overlay({
        "voice.gone": { origin: "edited", value: "a field that was removed" },
      }),
    );
    expect(resolved.overlaidPaths).toEqual([]);
    expect(
      (resolved.card as unknown as Record<string, unknown>)["voice"],
    ).toEqual(card.voice);
  });

  test("a valid path beside an invalid one still applies", () => {
    const resolved = resolveCard(
      card,
      overlay({
        "voice.gone": { origin: "edited", value: "x" },
        "voice.tense": { origin: "edited", value: "present" },
      }),
    );
    expect(resolved.overlaidPaths).toEqual(["voice.tense"]);
  });
});

describe("overlaidPaths without applying", () => {
  test("it reports what resolveCard would change", () => {
    const only = overlay({
      "diction.register": { origin: "edited", value: "plainer" },
    });
    expect(overlaidPaths(card, only)).toEqual(["diction.register"]);
    expect(overlaidPaths(card)).toEqual([]);
  });
});
