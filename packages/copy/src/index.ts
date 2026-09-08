import { author } from "./author.ts";
import { clarify } from "./clarify.ts";
import { draft } from "./draft.ts";
import { idea } from "./idea.ts";
import { models } from "./models.ts";
import { outline } from "./outline.ts";
import { research } from "./research.ts";
import { result } from "./result.ts";
import { shell } from "./shell.ts";

/**
 * The barrel, and the reason there is one.
 *
 * `rules.test.ts` walks this object and applies the content rules to every
 * string it finds. A screen that inlines its own sentence is invisible to that
 * walk — which is why the rule is "every string the interface renders lives
 * here", and why the barrel is the enumeration rather than a convenience.
 *
 * It is a plain object rather than `export *`: gate 4 refuses a star re-export
 * outright, because it adds every name of its target to the subpath's public
 * surface while the snapshot reports it unchanged.
 */
export const COPY = {
  author,
  clarify,
  draft,
  idea,
  models,
  outline,
  research,
  result,
  shell,
} as const;

export type Copy = typeof COPY;

/**
 * Every string in the barrel, with the dotted path that reaches it.
 *
 * Exported because the rules are tests over this list, and a rule that could
 * only be applied by re-walking the object in each test would be a rule each
 * test could walk differently.
 */
export const copyStrings = (): { path: string; text: string }[] => {
  const found: { path: string; text: string }[] = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      found.push({ path, text: value });
      return;
    }
    if (typeof value !== "object" || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      walk(child, path === "" ? key : `${path}.${key}`);
    }
  };
  walk(COPY, "");
  return found;
};
