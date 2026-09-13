import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  type SessionEvent,
  sessionEventSchema,
  storedEventSchema,
} from "./events.ts";
import { findingSchema, fitMeasureSchema } from "./fit.ts";
import { stageSchema } from "./pipeline.ts";
import { prosodyBlockSchema } from "./prosody.ts";
import {
  questionSchema,
  STEPS,
  sessionSchema,
  storedStepSchema,
  WORD_TARGET,
} from "./session.ts";
import { claimSchema, styleCardSchema } from "./style-card.ts";

const uuid = (): string => crypto.randomUUID();

describe("invariant 2: a derived claim must cite its evidence", () => {
  const claim = claimSchema(z.string().min(1));
  const citation = { passageId: uuid(), workId: "gutenberg:1", workTitle: "T" };

  test("derived with no citation fails to parse", () => {
    // Not a review comment and not a prompt instruction: a parse failure, so a
    // derived field with no evidence cannot reach a card, a report or an export.
    const result = claim.safeParse({
      origin: "derived",
      value: "first person",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("invariant 2");
  });

  test("derived with a citation parses", () => {
    expect(
      claim.safeParse({ citation, origin: "derived", value: "first person" })
        .success,
    ).toBe(true);
  });

  test.each(["measured", "edited"] as const)(
    "%s needs no citation",
    (origin) => {
      expect(claim.safeParse({ origin, value: "x" }).success).toBe(true);
    },
  );
});

describe("invariant 1: the measured block is not a Claim", () => {
  test("prosody is a plain block, so no origin can be attached to it", () => {
    // A Claim<ProsodyBlock> whose origin could be anything but "measured" is a
    // type that permits invariant 1 to be broken. The card's `prosody` field
    // parses a bare block, so the mistake is not expressible.
    const shape = styleCardSchema.shape.prosody;
    expect(shape).toBe(prosodyBlockSchema);
  });

  test("a block carrying an origin is rejected as an unknown key would be", () => {
    const withOrigin = { origin: "edited" };
    expect(prosodyBlockSchema.safeParse(withOrigin).success).toBe(false);
  });
});

describe("a question that cannot state its purpose does not parse", () => {
  const base = {
    answer: null,
    answerState: "open" as const,
    dependsOn: [],
    id: uuid(),
    ordinal: 0,
    round: 1,
    sessionId: uuid(),
    suggestions: ["a frame", "no frame"],
    text: "Should the story present itself as a review?",
  };

  test("a decision under 8 characters fails", () => {
    expect(
      questionSchema.safeParse({
        ...base,
        decision: "frame",
        whyAsked: "the idea names a man and a comet but no frame",
      }).success,
    ).toBe(false);
  });

  test("a whyAsked under 16 characters fails", () => {
    expect(
      questionSchema.safeParse({
        ...base,
        decision: "the story's frame",
        whyAsked: "unclear",
      }).success,
    ).toBe(false);
  });

  test("fewer than two suggestions fails", () => {
    // PRD §6: each question offers suggested answers plus "you decide". One
    // suggestion is a leading question, not a choice.
    expect(
      questionSchema.safeParse({
        ...base,
        decision: "the story's frame",
        suggestions: ["only one"],
        whyAsked: "the idea names a man and a comet but no frame",
      }).success,
    ).toBe(false);
  });

  test("a well-formed question parses", () => {
    expect(
      questionSchema.safeParse({
        ...base,
        decision: "the story's frame",
        whyAsked: "the idea names a man and a comet but no frame",
      }).success,
    ).toBe(true);
  });

  test("round is bounded at 3, which is the wizard's budget", () => {
    expect(
      questionSchema.safeParse({
        ...base,
        decision: "the story's frame",
        round: 4,
        whyAsked: "the idea names a man and a comet but no frame",
      }).success,
    ).toBe(false);
  });
});

describe("a finding must state a number", () => {
  test("prose with no digit is rejected", () => {
    // "the voice feels slightly off" is the failure mode this whole design
    // exists to avoid.
    expect(
      findingSchema.safeParse({
        path: "prosody.punctuation.semicolon",
        status: "drift",
        text: "the voice feels slightly off",
      }).success,
    ).toBe(false);
  });

  test("prose stating a number parses", () => {
    expect(
      findingSchema.safeParse({
        path: "prosody.punctuation.semicolon",
        status: "drift",
        text: "Semicolons run 6.1 per thousand words against 11.2 in the corpus.",
      }).success,
    ).toBe(true);
  });
});

describe("the classifier block marks a proxy, and only a proxy", () => {
  const measure = {
    band: [9.1, 13.4] as [number, number],
    bandBasis: "iqr" as const,
    corpusValue: 11.2,
    label: "semicolons",
    path: "prosody.punctuation.semicolon",
    status: "drift" as const,
    targetOrigin: "measured" as const,
    targetValue: 11.2,
    value: 6.1,
  };

  test("a count carries no classifier", () => {
    const parsed = fitMeasureSchema.parse(measure);
    expect(parsed.classifier).toBeUndefined();
  });

  test("a proxy carries one, unvalidated until measured", () => {
    const parsed = fitMeasureSchema.parse({
      ...measure,
      classifier: { kind: "suffix-proxy", validated: false },
      path: "prosody.latinateRatio",
    });
    expect(parsed.classifier?.validated).toBe(false);
    expect(parsed.classifier?.precision).toBeUndefined();
  });

  test("precision is only meaningful with validation", () => {
    const parsed = fitMeasureSchema.parse({
      ...measure,
      classifier: { kind: "suffix-proxy", precision: 0.89, validated: true },
      path: "prosody.latinateRatio",
    });
    expect(parsed.classifier?.precision).toBe(0.89);
  });
});

describe("the event vocabulary is closed and total", () => {
  const types: SessionEvent["type"][] = [
    "stage_start",
    "stage_detail",
    "stage_delta",
    "stage_end",
    "stage_error",
    "card",
    "questions",
    "outline",
    "drift",
    "report",
    "decision",
    "step",
    "session_end",
  ];

  test("a switch over every member needs no default", () => {
    // The exhaustiveness that makes the web app branch-free: adding a member
    // without handling it stops compiling.
    const describeEvent = (type: SessionEvent["type"]): string => {
      switch (type) {
        case "stage_start":
        case "stage_detail":
        case "stage_delta":
        case "stage_end":
        case "stage_error": {
          return "stage";
        }
        case "card":
        case "questions":
        case "outline":
        case "drift":
        case "report":
        case "decision": {
          return "artifact";
        }
        case "step":
        case "session_end": {
          return "session";
        }
      }
    };
    expect(types.map(describeEvent)).toHaveLength(13);
  });

  test("an unknown type does not parse", () => {
    expect(
      sessionEventSchema.safeParse({ stageId: "x", type: "stage_progress" })
        .success,
    ).toBe(false);
  });

  test("a stored event's seq starts at 1, never 0", () => {
    // Gap-free per session, from 1 (§7.3). A cursor of 0 means "from the
    // beginning"; a seq of 0 would collide with it.
    const base = {
      createdAt: new Date(),
      event: { step: "story" as const, type: "step" as const },
      sessionId: uuid(),
    };
    expect(storedEventSchema.safeParse({ ...base, seq: 0 }).success).toBe(
      false,
    );
    expect(storedEventSchema.safeParse({ ...base, seq: 1 }).success).toBe(true);
  });
});

describe("a stage with no tier is expressible", () => {
  test("prosody-compute has a role and no tier", () => {
    // §6.1: making the stage type able to say this removes a special case
    // rather than adding one — the design's research screen shows a Thinking
    // row with a null tier badge.
    const parsed = stageSchema.parse({
      id: "prosody-compute",
      reads: ["work-fetch"],
      role: "measure",
      streams: true,
      typed: false,
    });
    expect(parsed.tier).toBeUndefined();
    expect(parsed.promptId).toBeUndefined();
  });
});

describe("session", () => {
  test("the idea is required and non-empty — it is kept verbatim", () => {
    const base = {
      authorId: null,
      cardId: null,
      constraints: null,
      createdAt: new Date(),
      id: uuid(),
      lengthPreset: "flash" as const,
      step: "idea" as const,
      updatedAt: new Date(),
    };
    expect(sessionSchema.safeParse({ ...base, idea: "" }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...base, idea: "a comet" }).success).toBe(
      true,
    );
  });

  test("every preset has a word target", () => {
    expect(Object.keys(WORD_TARGET).sort()).toEqual([
      "flash",
      "long",
      "novelette",
      "short",
    ]);
  });
});

describe("a step as a row may still hold it", () => {
  test("draft reads back as story", () => {
    // `0009_story_step.sql` admits both, because a function still running the
    // previous deploy writes `draft` for minutes after the migration lands. A
    // row written in that window would otherwise fail `sessionSchema` and make
    // `GET /api/sessions/:id` answer 500 for that session for ever — the one
    // state the expand exists to prevent.
    expect(storedStepSchema.parse("draft")).toBe("story");
  });

  test("every current step still parses to itself", () => {
    for (const step of STEPS) {
      expect(storedStepSchema.parse(step)).toBe(step);
    }
  });

  test("a step nothing ever wrote is still refused", () => {
    expect(storedStepSchema.safeParse("critique").success).toBe(false);
  });
});
