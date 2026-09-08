import { describe, expect, test } from "bun:test";
import {
  applyBudget,
  type ClarifyQuestion,
  MAX_QUESTIONS,
  MAX_ROUNDS,
  parseClarifyResult,
  referencesAnswers,
} from "./clarify.ts";

const question = (
  overrides: Partial<ClarifyQuestion> = {},
): ClarifyQuestion => ({
  decision: "which frame the story takes",
  dependsOn: [],
  suggestions: ["the catalogue", "the letter"],
  text: "Whose account are we reading?",
  whyNotSettled: "the idea names a man and a comet but no frame",
  ...overrides,
});

describe("a question that cannot state its purpose does not parse", () => {
  test("a missing decision is a schema violation, not a dropped row", () => {
    // PRD §6's rule as a parse failure rather than a prompt instruction: such
    // a question never reaches the UI, because it cannot be constructed.
    expect(() =>
      parseClarifyResult({
        done: false,
        questions: [{ ...question(), decision: "" }],
      }),
    ).toThrow("cannot be asked");
  });

  test("a decision under eight characters is refused", () => {
    expect(() =>
      parseClarifyResult({
        done: false,
        questions: [{ ...question(), decision: "the pov" }],
      }),
    ).toThrow("cannot be asked");
  });

  test("one suggestion is refused; two are enough", () => {
    // A single option is not a choice, and five is a form.
    expect(() =>
      parseClarifyResult({
        done: false,
        questions: [{ ...question(), suggestions: ["only one"] }],
      }),
    ).toThrow();
    expect(() =>
      parseClarifyResult({ done: false, questions: [question()] }),
    ).not.toThrow();
  });

  test("a valid result parses with dependsOn defaulted", () => {
    const parsed = parseClarifyResult({
      done: false,
      questions: [
        {
          decision: "which frame the story takes",
          suggestions: ["a", "b"],
          text: "t",
          whyNotSettled: "the idea does not settle it at all",
        },
      ],
    });
    expect(parsed.questions[0]?.dependsOn).toEqual([]);
  });
});

describe("a later round's question must be grounded in what was answered", () => {
  const answered = [
    { answer: "the catalogue frame", answerState: "answered", id: "q1" },
  ];

  test("round 1 asks freely", () => {
    // "The idea does not specify a frame" is a valid reason in round 1.
    const round = applyBudget({
      answered: [],
      askedSoFar: 0,
      result: { done: false, questions: [question()] },
      round: 1,
    });
    expect(round.questions).toHaveLength(1);
  });

  test("round 3 drops a question that references nothing answered", () => {
    // By then the reader has answered something, and a question that does not
    // reference it is one the model could have asked before reading them.
    const round = applyBudget({
      answered,
      askedSoFar: 2,
      result: { done: false, questions: [question()] },
      round: 3,
    });
    expect(round.questions).toEqual([]);
    expect(round.dropped[0]?.why).toContain(
      "reference what was already answered",
    );
  });

  test("a dependsOn naming an answered question grounds it", () => {
    expect(referencesAnswers(question({ dependsOn: ["q1"] }), answered)).toBe(
      true,
    );
  });

  test("quoting the answer grounds it too", () => {
    expect(
      referencesAnswers(
        question({
          whyNotSettled:
            "you chose the catalogue frame, which leaves the narrator open",
        }),
        answered,
      ),
    ).toBe(true);
  });

  test("a short answer does not ground everything by accident", () => {
    // A substring match on "yes" fires on almost any sentence, so the check is
    // word-level and ignores words under four characters.
    expect(
      referencesAnswers(question(), [
        { answer: "yes", answerState: "answered", id: "q1" },
      ]),
    ).toBe(false);
  });

  test("a skipped question grounds nothing", () => {
    expect(
      referencesAnswers(question({ dependsOn: ["q9"] }), [
        { answer: null, answerState: "skipped", id: "q1" },
      ]),
    ).toBe(false);
  });
});

describe("the budget is the engine's, not the prompt's", () => {
  test("three rounds and eight questions are constants in code", () => {
    // A prompt-level budget is a suggestion; PRD §6 calls the budget the thing
    // that makes this a wizard.
    expect([MAX_ROUNDS, MAX_QUESTIONS]).toEqual([3, 8]);
  });

  test("five questions with two left are truncated to two", () => {
    // Truncation rather than refusal: the stage has produced two usable
    // questions, and discarding the round spends a model call to ask nothing.
    const round = applyBudget({
      answered: [],
      askedSoFar: 6,
      result: {
        done: false,
        questions: Array.from({ length: 5 }, () => question()),
      },
      round: 1,
    });
    expect(round.questions).toHaveLength(2);
    expect(round.dropped).toHaveLength(3);
    expect(round.done).toBe(true);
  });

  test("the third round is the last, whatever the stage says", () => {
    const round = applyBudget({
      answered: [
        { answer: "the catalogue", answerState: "answered", id: "q1" },
      ],
      askedSoFar: 1,
      result: {
        done: false,
        questions: [question({ dependsOn: ["q1"] })],
      },
      round: MAX_ROUNDS,
    });
    expect(round.questions).toHaveLength(1);
    expect(round.done).toBe(true);
  });

  test("a spent budget yields no questions at all", () => {
    const round = applyBudget({
      answered: [],
      askedSoFar: MAX_QUESTIONS,
      result: { done: false, questions: [question()] },
      round: 1,
    });
    expect(round.questions).toEqual([]);
    expect(round.done).toBe(true);
  });

  test("done from the stage is honoured even with budget left", () => {
    const round = applyBudget({
      answered: [],
      askedSoFar: 0,
      result: { done: true, questions: [] },
      round: 1,
    });
    expect(round.done).toBe(true);
  });
});
