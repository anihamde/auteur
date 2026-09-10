import { createHash } from "node:crypto";
import type { Pipeline, Stage } from "@auteur/core/pipeline";
import type { Session } from "@auteur/core/session";
import { PROMPT_VERSIONS, type PromptId } from "@auteur/prompt/versions";

/**
 * §7.5, as a computation.
 *
 * > Every artifact stores the hash of the inputs it was produced from. An
 * > artifact is stale when that hash no longer matches.
 *
 * The point of doing it this way is what is *not* here: there is no per-step
 * invalidation rule, no `if (answerChanged) invalidate([...])`, and nothing
 * that has to be updated when a stage is added. The six consequences §7.5
 * lists fall out of `reads` plus the direct inputs below, and the suite names
 * all six so a change that breaks one of them fails by name.
 */

export type StalenessInput = {
  readonly pipeline: Pipeline;
  readonly session: Session;
  /** Every answered or skipped question, in order. Empty before `clarify`. */
  readonly answers: readonly {
    readonly id: string;
    readonly answer: string | null;
  }[];
  /** The model each stage would run, pinned or resolved. */
  readonly models: ReadonlyMap<string, string>;
  /** What each stage last completed with. Absent means never completed. */
  readonly completed: ReadonlyMap<string, string>;
};

const hash = (parts: readonly string[]): string =>
  createHash("sha256").update(parts.join(" ")).digest("hex");

/**
 * The session state a stage reads directly, per §7.5.
 *
 * Everything else reaches a stage through `reads`, transitively — which is why
 * this function is short and why adding a stage does not lengthen it. A stage
 * not named here reads nothing directly, and that is a real answer rather than
 * a gap: `work-fetch` reads `corpus-select`'s output and nothing of the
 * session's.
 */
export const directInputsOf = (
  stage: Stage,
  input: StalenessInput,
): readonly string[] => {
  const { session } = input;
  const answerSet = (): string =>
    input.answers
      .map((entry) => `${entry.id}=${entry.answer ?? "<skipped>"}`)
      .join("|");

  switch (stage.id) {
    case "corpus-select": {
      return [`author=${session.authorId ?? "<none>"}`];
    }
    case "style-extract": {
      // The card is the author's, not the session's, but which card the session
      // is bound to is session state — repinning it must restale what read it.
      return [`card=${session.cardId ?? "<none>"}`];
    }
    case "clarify": {
      return [
        `idea=${session.idea}`,
        `constraints=${session.constraints ?? ""}`,
      ];
    }
    case "outline": {
      return [
        `idea=${session.idea}`,
        `constraints=${session.constraints ?? ""}`,
        `preset=${session.lengthPreset}`,
        `answers=${answerSet()}`,
        `card=${session.cardId ?? "<none>"}`,
      ];
    }
    case "draft": {
      // The preset is here as well as on `outline` because it changes the draft
      // strategy (§6.6) and not only the beat count.
      return [
        `preset=${session.lengthPreset}`,
        `card=${session.cardId ?? "<none>"}`,
      ];
    }
    default: {
      return [];
    }
  }
};

const isPromptId = (value: string): value is PromptId =>
  Object.hasOwn(PROMPT_VERSIONS, value);

/**
 * The shape a stage writes its stored output in.
 *
 * A stage's key covers everything that decides *what it would produce*, and
 * until this it did not cover the *shape* that output is stored in. Those come
 * apart exactly once: when the schema a downstream stage reads the output back
 * with changes while every input stays the same. The stage is then fresh by
 * comparison and unreadable in fact — `readStageOutput` throws on a document
 * written by the older shape, the downstream stage fails, and the only stage
 * that could rewrite it is the one staleness reports as up to date. Retrying
 * cannot help, because nothing about the session changed.
 *
 * Bumping the number here is what restales such an output. A stage with no
 * entry has never changed shape, which is why this map is short rather than
 * one line per stage: this is the same kind of declaration as `PROMPT_VERSIONS`
 * — a version of the thing produced, not an invalidation rule about who reads
 * it.
 */
export const OUTPUT_VERSIONS: Readonly<Record<string, number>> = {
  // 2: candidates come from `catalogue_works`, so the stored works are
  // `CorpusCandidate` (string id, `sourceUrl`) and no longer gutendex books.
  "corpus-select": 2,
};

/**
 * Every stage's input key, in graph order.
 *
 * A stage's key includes the keys of the stages it reads, so a change anywhere
 * upstream reaches every stage downstream without anyone listing the descendants.
 * The keys are computed from the current session — not read from `stage_keys` —
 * because the question being asked is "what would this stage's key be now".
 *
 * `outputVersions` is a parameter so a test can assert that a bump propagates
 * without waiting for a real shape change to make one.
 */
export const inputKeys = (
  input: StalenessInput,
  outputVersions: Readonly<Record<string, number>> = OUTPUT_VERSIONS,
): Map<string, string> => {
  const keys = new Map<string, string>();
  for (const stage of input.pipeline.stages) {
    const promptVersion =
      stage.promptId !== undefined && isPromptId(stage.promptId)
        ? PROMPT_VERSIONS[stage.promptId]
        : "<no-prompt>";
    keys.set(
      stage.id,
      hash([
        stage.id,
        promptVersion,
        `output=${(outputVersions[stage.id] ?? 1).toString()}`,
        input.models.get(stage.id) ?? "<no-model>",
        ...stage.reads.map((read) => keys.get(read) ?? "<not-computed>"),
        ...directInputsOf(stage, input),
      ]),
    );
  }
  return keys;
};

export type Staleness = {
  /** Every stage whose key differs from the one it completed with. */
  readonly stale: readonly string[];
  readonly keys: ReadonlyMap<string, string>;
};

/**
 * Which stages are stale, in graph order.
 *
 * A stage that never completed has no stored key and is stale by absence, not
 * by comparison against a sentinel — the difference matters, because a sentinel
 * is a value some stage could one day produce.
 */
export const staleness = (input: StalenessInput): Staleness => {
  const keys = inputKeys(input);
  const stale = input.pipeline.stages
    .filter((stage) => input.completed.get(stage.id) !== keys.get(stage.id))
    .map((stage) => stage.id);
  return { keys, stale };
};

/**
 * The stale stages between where the session is and where it was asked to go.
 *
 * `upTo` is a stage id: everything at or before it in graph order is in scope
 * and everything after is not, so advancing to `outline` does not draft.
 */
export const staleUpTo = (input: StalenessInput, upTo: string): string[] => {
  const order = input.pipeline.stages.map((stage) => stage.id);
  const limit = order.indexOf(upTo);
  const inScope = limit === -1 ? order : order.slice(0, limit + 1);
  const { stale } = staleness(input);
  return inScope.filter((id) => stale.includes(id));
};
