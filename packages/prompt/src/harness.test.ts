import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { clarify } from "./clarify.ts";
import { corpusSelect } from "./corpus-select.ts";
import { outline } from "./outline.ts";
import { story } from "./story.ts";
import { styleExtract } from "./style-extract.ts";
import { styleFields } from "./style-fields.ts";
import { summarizeBeat } from "./summarize-beat.ts";
import { PROMPT_VERSIONS, type Prompt } from "./versions.ts";

/**
 * The properties every prompt has, asserted once rather than per module.
 *
 * A per-module copy of these would be one copy per prompt to keep in
 * agreement, and the next prompt would arrive with all but one of them.
 */

const PROMPTS = [
  clarify,
  corpusSelect,
  outline,
  story,
  styleExtract,
  styleFields,
  summarizeBeat,
] as const;

const SRC = fileURLToPath(new URL(".", import.meta.url));

describe("versions", () => {
  test.each(PROMPTS.map((prompt) => [prompt.id, prompt] as const))(
    "%s carries a well-formed version",
    (_id, prompt: Prompt<never>) => {
      expect(prompt.version).toMatch(/^[a-z-]+@\d+$/);
    },
  );

  test("every prompt's version is the one versions.ts publishes", () => {
    // The pipeline reads versions from that map to build a card's buildKey. A
    // bumped module with an unbumped entry would serve stale cards silently.
    for (const prompt of PROMPTS) {
      expect([prompt.id, prompt.version]).toEqual([
        prompt.id,
        PROMPT_VERSIONS[prompt.id],
      ]);
    }
  });

  test("versions.ts names every prompt and no other", () => {
    expect(Object.keys(PROMPT_VERSIONS).sort()).toEqual(
      PROMPTS.map((prompt) => prompt.id).sort(),
    );
  });

  test("a version's stage half is the module's id", () => {
    for (const prompt of PROMPTS) {
      expect(prompt.version.split("@")[0]).toBe(prompt.id);
    }
  });
});

describe("purity", () => {
  const modules = readdirSync(SRC).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );

  test("every prompt module is here", () => {
    // Otherwise the import check below could pass by scanning nothing.
    expect(modules.length).toBeGreaterThanOrEqual(PROMPTS.length);
  });

  test.each(modules.map((file) => [file] as const))(
    "%s imports nothing outside @auteur/core",
    (file) => {
      // A prompt that read the clock, the environment or the database would
      // make its snapshot meaningless and its output unreproducible — and the
      // card's buildKey assumes a prompt version determines a prompt string.
      const source = readFileSync(`${SRC}${file}`, "utf8");
      const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map(
        (match) => match[1] ?? "",
      );
      const foreign = imports.filter(
        (specifier) =>
          !specifier.startsWith("./") && !specifier.startsWith("@auteur/core/"),
      );
      expect([file, foreign]).toEqual([file, []]);
    },
  );

  test.each(modules.map((file) => [file] as const))(
    "%s reads no clock, env or randomness",
    (file) => {
      const source = readFileSync(`${SRC}${file}`, "utf8");
      for (const forbidden of [
        "Date.now",
        "new Date(",
        "Math.random",
        "process.env",
        "Bun.env",
        "fetch(",
      ]) {
        expect([file, forbidden, source.includes(forbidden)]).toEqual([
          file,
          forbidden,
          false,
        ]);
      }
    },
  );
});
