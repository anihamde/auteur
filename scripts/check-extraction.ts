#!/usr/bin/env bun
import {
  exemplarsJsonSchema,
  fieldsJsonSchema,
} from "../apps/auteur-web/server/_stages/card.ts";
import type { ProsodyBlock } from "../packages/core/src/prosody.ts";
/**
 * Whether real models can satisfy the extraction contract — **[key][net]**.
 *
 * `check-stage-schemas.ts` asks whether the gateway *accepts* the schemas. This
 * asks the harder question: given the prompts this product actually sends,
 * against a corpus in the shape it actually sends one, do the answers parse and
 * does a card build from them?
 *
 * The failure it exists for shipped green with 1,200 tests passing. The schema
 * was accepted, the model answered valid JSON, and the answer was `fields: []`
 * with one invented passage id — because the prompt described the card in prose
 * and named none of the twenty-two paths that make one. No test could see it:
 * every test in this repository hands the prompt to a stub, so what is being
 * asserted is that the stub returns what the stub was told to return.
 *
 * **It runs both passes.** The card is read by `style-fields` and then by
 * `style-extract`, because one call doing both exceeded the sixty seconds an
 * invocation gets. A probe that ran one call would be checking a topology the
 * product does not have — and the per-pass seconds it reports are the only
 * evidence that the split achieved what it was for.
 *
 * **The fixture is small on purpose.** Nine short public-domain passages rather
 * than the twenty a real extraction reads. The question is whether the contract
 * is satisfiable — every path named, the exemplar floor reachable, ids copied
 * rather than composed — so a pass here is not a promise about the
 * deployment's latency. The cost lines beside it are what say that.
 *
 * **What it does not judge is the reading.** Whether "a register that reaches
 * for the Latinate abstraction" is a good sentence about Austen is not a thing
 * a check can decide, and one that tried would fail on a good answer it did not
 * expect. It judges the contract, which is the part that has broken.
 */
import {
  CLAIM_PATHS,
  styleCardSchema,
} from "../packages/core/src/style-card.ts";
import type { JsonSchema } from "../packages/model-provider/src/request.ts";
import {
  cardFromExtraction,
  type ExtractedExemplars,
  type ExtractedFields,
  exemplarsSchema,
  fieldsSchema,
} from "../packages/pipeline/src/extract.ts";
import { styleExtract } from "../packages/prompt/src/style-extract.ts";
import { styleFields } from "../packages/prompt/src/style-fields.ts";
import { CATALOGUE } from "../packages/provider-router/src/models.ts";
import { type Fetch, RESPONSES_URL } from "./check-stage-schemas.ts";
import fixture from "./fixtures/extraction-probe.json" with { type: "json" };

/**
 * The ceiling production sends, which is the model's own.
 *
 * `callModel` defaults `maxTokens` to `context.model.maxOutputTokens`, so a
 * probe with its own smaller number would be a stricter test than the product
 * ever runs — and an answer cut off at 8,000 would be reported as a prompt
 * failure that production never has. A probe must send what production sends or
 * it is measuring something else.
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

/** What one pass cost. Per pass, because each has its own invocation to fit in. */
export type PassCost = {
  readonly stageId: string;
  readonly seconds: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
};

export type ExtractionOutcome =
  | {
      readonly ok: true;
      readonly fields: number;
      readonly exemplars: number;
      readonly cost: readonly PassCost[];
    }
  | {
      readonly ok: false;
      readonly lines: readonly string[];
      readonly cost: readonly PassCost[];
    };

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

/**
 * What the gateway said about the answer, beside the answer itself.
 *
 * A Responses call that hits `max_output_tokens` comes back `incomplete` with
 * partial content — which, under a strict schema, can be a structurally valid
 * object with empty arrays in it. That is indistinguishable from a model that
 * read the prompt and declined, and the two want completely different fixes.
 */
export const contextOf = (payload: unknown, text: string): string[] => {
  const status = Reflect.get(payload as object, "status");
  const incomplete = Reflect.get(payload as object, "incomplete_details");
  const reason =
    typeof incomplete === "object" && incomplete !== null
      ? Reflect.get(incomplete, "reason")
      : undefined;
  return [
    [
      typeof status === "string" ? `status ${status}` : undefined,
      typeof reason === "string" ? `incomplete: ${reason}` : undefined,
      `${text.length.toString()} characters of text`,
    ]
      .filter((part) => part !== undefined)
      .join(", "),
    ...(text === "" ? [] : [`answer began: ${text.slice(0, 200)}`]),
  ];
};

/** Tokens out of the gateway's own `usage` block, with the wall clock. */
export const costOf = (
  payload: unknown,
  stageId: string,
  seconds: number,
): PassCost => {
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
    stageId,
  };
};

export const costLine = (cost: PassCost): string =>
  [
    `${cost.stageId}: ${cost.seconds.toFixed(1)}s`,
    cost.inputTokens === undefined
      ? undefined
      : `${cost.inputTokens.toLocaleString("en-US")} in`,
    cost.outputTokens === undefined
      ? undefined
      : `${cost.outputTokens.toLocaleString("en-US")} out`,
  ]
    .filter((part) => part !== undefined)
    .join(", ");

const passageArgs = (probe: Probe) =>
  probe.passages.map((passage) => ({
    id: passage.id,
    text: passage.text,
    workTitle: probe.workTitle,
  }));

/**
 * The two requests, built by the product's own builders.
 *
 * A probe carrying its own copy of a prompt would go green on a prompt nothing
 * uses — the failure mode of every check written beside the thing it checks
 * rather than through it.
 */
export const fieldsRequest = (
  probe: Probe,
): { readonly prompt: string; readonly schema: JsonSchema } => ({
  prompt: styleFields.build({
    authorName: probe.authorName,
    passages: passageArgs(probe),
    prosody: probe.prosody,
  }),
  schema: fieldsJsonSchema(probe.passages.map((passage) => passage.id)),
});

export const exemplarsRequest = (
  probe: Probe,
  fields: ExtractedFields,
): { readonly prompt: string; readonly schema: JsonSchema } => ({
  prompt: styleExtract.build({
    authorName: probe.authorName,
    passages: passageArgs(probe),
    readings: fields.fields.map((field) => ({
      path: field.path,
      value: Array.isArray(field.value) ? field.value.join("; ") : field.value,
    })),
  }),
  schema: exemplarsJsonSchema(probe.passages.map((passage) => passage.id)),
});

/**
 * What the model actually returned, when a card does not build.
 *
 * The zod issues say which claims are missing. They do not say **why**, and the
 * two whys want opposite fixes: a path the model never returned is a prompt
 * that did not ask clearly enough, and a path it returned without a citation is
 * the assembler refusing to write it — decision 0004 working, against a card
 * schema that requires every claim. Telling those apart from the issue list
 * alone is guessing, and guessing is what costs a round.
 */
export const census = (fields: ExtractedFields): string[] => {
  const returned = new Set(fields.fields.map((field) => field.path));
  const cited = new Set(
    fields.fields
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

/**
 * Assemble the card from both passes' answers.
 *
 * Assembled and not merely parsed, because those fail differently and only the
 * second is the product's actual promise: an extraction can satisfy its schema
 * and still leave `styleCardSchema` short a required claim, which is the state
 * the deployment reached — a stage that succeeded at everything except
 * producing a card.
 */
export const judge = (
  fields: ExtractedFields,
  exemplars: ExtractedExemplars,
  probe: Probe,
  cost: readonly PassCost[],
): ExtractionOutcome => {
  try {
    const card = cardFromExtraction({
      author: {
        displayName: probe.authorName,
        id: probe.authorId,
        kind: "full-text",
      },
      extraction: { exemplars: exemplars.exemplars, fields: fields.fields },
      // The ids that were offered, so a citation the model copied resolves. An
      // uncited field is not written to the card at all (decision 0004), so
      // passing anything else here would fail every claim and report the
      // probe's own bug as the model's.
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
    const parsed = styleCardSchema.safeParse(card);
    if (!parsed.success) {
      return {
        cost,
        lines: [
          ...parsed.error.issues
            .slice(0, 5)
            .map(
              (issue) =>
                `${issue.path.join(".") || "(root)"}: ${issue.message}`,
            ),
          "The assembler produced something styleCardSchema refuses.",
        ],
        ok: false,
      };
    }
    return {
      cost,
      exemplars: exemplars.exemplars.length,
      fields: fields.fields.length,
      ok: true,
    };
  } catch (thrown) {
    return {
      cost,
      lines: [
        ...issuesOf(thrown),
        ...census(fields),
        "The answers parsed and the card did not build: a path the model did",
        "not return, or one it could not cite — an uncited claim is counted",
        "and not written (decision 0004).",
      ],
      ok: false,
    };
  }
};

type PassResult =
  | { readonly ok: true; readonly value: unknown; readonly cost: PassCost }
  | { readonly ok: false; readonly lines: string[]; readonly cost?: PassCost };

const runPass = async (
  apiKey: string,
  modelId: string,
  stageId: string,
  built: { readonly prompt: string; readonly schema: JsonSchema },
  config: { readonly fetch?: Fetch; readonly url?: string },
): Promise<PassResult> => {
  const call = config.fetch ?? (fetch as unknown as Fetch);
  const started = Date.now();
  const response = await call(config.url ?? RESPONSES_URL, {
    body: JSON.stringify({
      input: built.prompt,
      instructions: "Return only JSON matching the declared schema.",
      max_output_tokens: maxOutputTokensFor(modelId),
      model: modelId,
      store: false,
      text: {
        format: {
          name: stageId,
          schema: built.schema,
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
  const seconds = (Date.now() - started) / 1000;
  if (!response.ok) {
    return {
      lines: [
        `${stageId}: the gateway answered ${response.status.toString()} after ${seconds.toFixed(1)}s`,
        (await response.text()).slice(0, 300),
      ],
      ok: false,
    };
  }
  const payload: unknown = await response.json();
  const text = textOf(payload);
  const cost = costOf(payload, stageId, seconds);
  try {
    return { cost, ok: true, value: JSON.parse(text) };
  } catch {
    return {
      cost,
      lines: [
        `${stageId}: the answer is not JSON`,
        ...contextOf(payload, text),
      ],
      ok: false,
    };
  }
};

export const runExtractionProbe = async (
  apiKey: string,
  modelId: string,
  probe: Probe = PROBE,
  config: { readonly fetch?: Fetch; readonly url?: string } = {},
): Promise<ExtractionOutcome> => {
  const first = await runPass(
    apiKey,
    modelId,
    "style-fields",
    fieldsRequest(probe),
    config,
  );
  if (!first.ok) {
    return {
      cost: first.cost === undefined ? [] : [first.cost],
      lines: first.lines,
      ok: false,
    };
  }
  const fields = fieldsSchema.safeParse(first.value);
  if (!fields.success) {
    return {
      cost: [first.cost],
      lines: [
        ...fields.error.issues
          .slice(0, 5)
          .map(
            (issue) =>
              `style-fields.${issue.path.join(".") || "(root)"}: ${issue.message}`,
          ),
        "The schema was accepted, so this is the prompt.",
      ],
      ok: false,
    };
  }

  const second = await runPass(
    apiKey,
    modelId,
    "style-extract",
    exemplarsRequest(probe, fields.data),
    config,
  );
  if (!second.ok) {
    return {
      cost: [first.cost, ...(second.cost === undefined ? [] : [second.cost])],
      lines: second.lines,
      ok: false,
    };
  }
  const exemplars = exemplarsSchema.safeParse(second.value);
  if (!exemplars.success) {
    return {
      cost: [first.cost, second.cost],
      lines: [
        ...exemplars.error.issues
          .slice(0, 5)
          .map(
            (issue) =>
              `style-extract.${issue.path.join(".") || "(root)"}: ${issue.message}`,
          ),
        ...census(fields.data),
      ],
      ok: false,
    };
  }

  return judge(fields.data, exemplars.data, probe, [first.cost, second.cost]);
};
