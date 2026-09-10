#!/usr/bin/env bun
import { extractionJsonSchema } from "../apps/auteur-web/server/_stages/card.ts";
/**
 * Whether a real model can satisfy the extraction contract — **[key][net]**.
 *
 * `check-stage-schemas.ts` asks whether the gateway *accepts* the schema. This
 * asks the harder question: given the prompt this product actually sends,
 * against a corpus in the shape it actually sends one, does the answer parse
 * and does a card build from it?
 *
 * The failure it exists for shipped green with 1,200 tests passing. The schema
 * was accepted, the model answered valid JSON, and the answer was `fields: []`
 * with one invented passage id — because the prompt described the card in prose
 * and named none of the twenty-two paths that make one. No test could see it:
 * every test in this repository hands the prompt to a stub, so what is being
 * asserted is that the stub returns what the stub was told to return.
 *
 * **The fixture is small on purpose.** Nine short public-domain passages rather
 * than forty of nine hundred words. The question is whether the contract is
 * satisfiable — every path named, the exemplar floor reachable, ids copied
 * rather than composed — and a full corpus costs forty times as much to learn
 * the same thing. Nine and not eight because a probe offering exactly the
 * minimum could be satisfied by exhaustion.
 *
 * **What it does not judge is the reading.** Whether "a register that reaches
 * for the Latinate abstraction" is a good sentence about Austen is not a thing
 * a check can decide, and one that tried would fail on a good answer it did not
 * expect. It judges the contract, which is the part that has broken.
 */
import type { ProsodyBlock } from "../packages/core/src/prosody.ts";
import {
  CLAIM_PATHS,
  styleCardSchema,
} from "../packages/core/src/style-card.ts";
import type { JsonSchema } from "../packages/model-provider/src/request.ts";
import {
  cardFromExtraction,
  extractionSchema,
} from "../packages/pipeline/src/extract.ts";
import { styleExtract } from "../packages/prompt/src/style-extract.ts";
import { CATALOGUE } from "../packages/provider-router/src/models.ts";
import { type Fetch, RESPONSES_URL } from "./check-stage-schemas.ts";
import fixture from "./fixtures/extraction-probe.json" with { type: "json" };

/**
 * The ceiling production sends, which is the model's own.
 *
 * `callModel` defaults `maxTokens` to `context.model.maxOutputTokens`, so a
 * probe with its own smaller number would be a stricter test than the product
 * ever runs — and an answer cut off at 8,000 would be reported as a prompt
 * failure that production never has. A probe must send what production sends
 * or it is measuring something else.
 */
const maxOutputTokensFor = (modelId: string): number =>
  CATALOGUE.find((row) => row.id === modelId)?.maxOutputTokens ?? 8_000;

export type Probe = {
  readonly authorName: string;
  readonly authorId: string;
  readonly passages: readonly { readonly id: string; readonly text: string }[];
  readonly prosody: ProsodyBlock;
  readonly workId: string;
  readonly workTitle: string;
  readonly year: number;
};

export const PROBE = fixture as unknown as Probe;

/**
 * The model's text, out of a Responses answer.
 *
 * `output_text` when the gateway offers the convenience field, and a walk of
 * `output[].content[]` when it does not. Both, because which one arrives is the
 * gateway's choice and a probe that guessed wrong would report a contract
 * failure for a response it simply could not read.
 */
export const textOf = (payload: unknown): string => {
  if (typeof payload !== "object" || payload === null) return "";
  const direct = Reflect.get(payload, "output_text");
  if (typeof direct === "string") return direct;
  const output = Reflect.get(payload, "output");
  if (!Array.isArray(output)) return "";
  return output
    .flatMap((item: unknown) => {
      const content = Reflect.get(item as object, "content");
      return Array.isArray(content) ? content : [];
    })
    .map((part: unknown) => Reflect.get(part as object, "text"))
    .filter((text): text is string => typeof text === "string")
    .join("");
};

export type ExtractionOutcome =
  | {
      readonly ok: true;
      readonly fields: number;
      readonly exemplars: number;
      /**
       * What the call cost, which is the number that decides the topology.
       *
       * A stage runs inside one 60-second invocation. This probe sends nine
       * short passages and the deployment sends forty of four hundred to nine
       * hundred words, so if the probe is near the ceiling the deployment is
       * past it — and the fix is to split the stage, not to retry it. Whether
       * the cost is in generating the answer or in reading the prompt decides
       * *how* to split, and only the token counts say which.
       */
      readonly cost?: {
        readonly seconds: number;
        readonly inputTokens?: number;
        readonly outputTokens?: number;
      };
    }
  | { readonly ok: false; readonly lines: readonly string[] };

/**
 * The prompt and schema this product sends, against a real model.
 *
 * Built from `styleExtract.build` and `extractionJsonSchema` rather than from
 * copies: a probe carrying its own prompt would go green on a prompt the
 * product does not use, which is the failure mode of every check written beside
 * the thing it checks instead of through it.
 */
export const request = (
  probe: Probe,
): { readonly prompt: string; readonly schema: JsonSchema } => ({
  prompt: styleExtract.build({
    authorName: probe.authorName,
    passages: probe.passages.map((passage) => ({
      id: passage.id,
      text: passage.text,
      workTitle: probe.workTitle,
    })),
    prosody: probe.prosody,
  }),
  schema: extractionJsonSchema(probe.passages.map((passage) => passage.id)),
});

/**
 * Parse the answer, and build the card from it.
 *
 * Both, because they fail differently and only the second is the product's
 * actual promise: an extraction can parse and still leave `styleCardSchema`
 * short a required claim, which is the state the deployment reached — a stage
 * that succeeded at everything except producing a card.
 */
/**
 * What the gateway said about the answer, beside the answer itself.
 *
 * A Responses call that hits `max_output_tokens` comes back `incomplete` with
 * partial content — which, under a strict schema, can be a structurally valid
 * object with empty arrays in it. That is indistinguishable from a model that
 * read the prompt and declined, and the two want completely different fixes:
 * one is a budget, the other is the prompt. The gateway says which, in a field
 * this used to throw away.
 *
 * The text sample is here for the same reason. "The answer is not an
 * extraction" is a state; the first two hundred characters of it are a reason.
 */
export const contextOf = (payload: unknown, text: string): string[] => {
  const status = Reflect.get(payload as object, "status");
  const incomplete = Reflect.get(payload as object, "incomplete_details");
  const reason =
    typeof incomplete === "object" && incomplete !== null
      ? Reflect.get(incomplete, "reason")
      : undefined;
  const usage = Reflect.get(payload as object, "usage");
  const output =
    typeof usage === "object" && usage !== null
      ? Reflect.get(usage, "output_tokens")
      : undefined;
  return [
    [
      typeof status === "string" ? `status ${status}` : undefined,
      typeof reason === "string" ? `incomplete: ${reason}` : undefined,
      typeof output === "number"
        ? `${output.toString()} output tokens`
        : undefined,
      `${text.length.toString()} characters of text`,
    ]
      .filter((part) => part !== undefined)
      .join(", "),
    ...(text === "" ? [] : [`answer began: ${text.slice(0, 200)}`]),
  ];
};

export type Cost = {
  readonly seconds: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
};

/** Tokens and seconds, out of the gateway's own `usage` block. */
export const costOf = (payload: unknown, seconds: number): Cost => {
  const usage = Reflect.get(payload as object, "usage");
  const read = (key: string): number | undefined => {
    const value =
      typeof usage === "object" && usage !== null
        ? Reflect.get(usage, key)
        : undefined;
    return typeof value === "number" ? value : undefined;
  };
  const input = read("input_tokens");
  const output = read("output_tokens");
  return {
    ...(input !== undefined && { inputTokens: input }),
    ...(output !== undefined && { outputTokens: output }),
    seconds,
  };
};

export const judge = (
  text: string,
  probe: Probe,
  context: readonly string[] = [],
  cost?: Cost,
): ExtractionOutcome => {
  const parsed = extractionSchema.safeParse(
    ((): unknown => {
      try {
        return JSON.parse(text);
      } catch {
        return undefined;
      }
    })(),
  );
  if (!parsed.success) {
    return {
      lines: [
        ...parsed.error.issues
          .slice(0, 5)
          .map(
            (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
          ),
        ...context,
        "A `status` of `incomplete` is a budget, not a prompt: the answer was",
        "cut off at `max_output_tokens` and a strict schema can make the",
        "fragment structurally valid with empty arrays in it. Anything else",
        "here is the prompt — the schema was accepted.",
      ],
      ok: false,
    };
  }
  // `buildCard` throws rather than returning a card that does not parse, and
  // the `AuteurError` it throws carries the issues. Catching is how the probe
  // reports the finding rather than dying on it.
  try {
    const outcome = built(parsed.data, probe);
    return outcome.ok && cost !== undefined ? { ...outcome, cost } : outcome;
  } catch (thrown) {
    return {
      lines: [...issuesOf(thrown), ...census(parsed.data)],
      ok: false,
    };
  }
};

/**
 * What the model actually returned, when the card did not build.
 *
 * The zod issues say which claims are missing from the card. They do not say
 * **why**, and the two whys want opposite fixes: a path the model never
 * returned is a prompt that did not ask clearly enough, and a path it returned
 * without a citation is the assembler refusing to write it (decision 0004) —
 * which is the product's rule working, against a card schema that requires
 * every claim.
 *
 * Telling those apart from the issue list alone is guessing, and guessing is
 * what costs a round.
 */
const census = (
  extraction: ReturnType<typeof extractionSchema.parse>,
): string[] => {
  const returned = new Set(extraction.fields.map((field) => field.path));
  const cited = new Set(
    extraction.fields
      .filter(
        (field) =>
          field.citationPassageId !== undefined &&
          field.citationPassageId !== null,
      )
      .map((field) => field.path),
  );
  const wanted = CLAIM_PATHS.map((claim) => claim.path);
  const absent = wanted.filter((path) => !returned.has(path));
  const uncited = wanted.filter(
    (path) => returned.has(path) && !cited.has(path),
  );
  const unknown = [...returned].filter((path) => !wanted.includes(path));
  return [
    `returned ${returned.size.toString()} of ${wanted.length.toString()} paths, ${cited.size.toString()} of them cited`,
    ...(absent.length > 0 ? [`never returned: ${absent.join(", ")}`] : []),
    ...(uncited.length > 0
      ? [`returned uncited, so not written to the card: ${uncited.join(", ")}`]
      : []),
    ...(unknown.length > 0 ? [`not a claim path: ${unknown.join(", ")}`] : []),
  ];
};

/** Zod issues out of whatever `buildCard` threw. */
const issuesOf = (thrown: unknown): string[] => {
  const detail =
    thrown instanceof Error
      ? (Reflect.get(thrown, "detail") as Record<string, unknown> | undefined)
      : undefined;
  const issues = detail?.["issues"];
  if (!Array.isArray(issues)) {
    return [
      thrown instanceof Error ? thrown.message : "the card did not build",
    ];
  }
  return issues
    .slice(0, 5)
    .map((issue: { path?: unknown; message?: unknown }) => {
      const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
      return `${path === "" ? "(root)" : path}: ${String(issue.message ?? "invalid")}`;
    });
};

const built = (
  extraction: ReturnType<typeof extractionSchema.parse>,
  probe: Probe,
): ExtractionOutcome => {
  const card = cardFromExtraction({
    author: {
      displayName: probe.authorName,
      id: probe.authorId,
      kind: "full-text",
    },
    extraction,
    // The ids that were offered, so a citation the model copied resolves. An
    // uncited field is not written to the card at all (decision 0004), so
    // passing anything else here would fail every claim and report the probe's
    // own bug as the model's.
    passages: probe.passages.map((passage) => ({
      id: passage.id,
      workId: probe.workId,
      workTitle: probe.workTitle,
      year: probe.year,
    })),
    prosody: probe.prosody,
    sources: [
      {
        id: probe.workId,
        title: probe.workTitle,
        wordCount: probe.prosody.words,
        year: probe.year,
      },
    ],
    toolchain: { cleaner: "probe", prosody: "probe", segmenter: "probe" },
    version: 1,
  });
  const parsedCard = styleCardSchema.safeParse(card);
  if (!parsedCard.success) {
    return {
      lines: [
        ...parsedCard.error.issues
          .slice(0, 5)
          .map(
            (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
          ),
        "The assembler produced something styleCardSchema refuses.",
      ],
      ok: false,
    };
  }
  return {
    exemplars: extraction.exemplars.length,
    fields: extraction.fields.length,
    ok: true,
  };
};

export const runExtractionProbe = async (
  apiKey: string,
  modelId: string,
  probe: Probe = PROBE,
  config: { readonly fetch?: Fetch; readonly url?: string } = {},
): Promise<ExtractionOutcome> => {
  const call = config.fetch ?? (fetch as unknown as Fetch);
  const started = Date.now();
  const { prompt, schema } = request(probe);
  const response = await call(config.url ?? RESPONSES_URL, {
    body: JSON.stringify({
      input: prompt,
      instructions: "Return only JSON matching the declared schema.",
      max_output_tokens: maxOutputTokensFor(modelId),
      model: modelId,
      store: false,
      text: {
        format: {
          name: "style-extract",
          schema,
          strict: true,
          type: "json_schema",
        },
      },
    }),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) {
    return {
      lines: [
        `the gateway answered ${response.status.toString()}`,
        (await response.text()).slice(0, 300),
      ],
      ok: false,
    };
  }
  const payload: unknown = await response.json();
  const text = textOf(payload);
  return judge(
    text,
    probe,
    contextOf(payload, text),
    costOf(payload, (Date.now() - started) / 1000),
  );
};
