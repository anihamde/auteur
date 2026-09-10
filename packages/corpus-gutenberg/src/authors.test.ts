import { describe, expect, test } from "bun:test";
import { mintAuthorId, slugifyName } from "./authors.ts";

const person = (name: string, birth: number | null = null) => ({
  birthYear: birth,
  name,
});

describe("the id is minted here, because the catalogue has none", () => {
  test("two authors sharing a name and differing in birth year mint distinct ids", () => {
    // What the birth year is for, and why the UI shows dates on every row.
    expect(mintAuthorId(person("Smith, John", 1820))).not.toBe(
      mintAuthorId(person("Smith, John", 1901)),
    );
  });

  test("an author with no birth year mints a stable id without one", () => {
    expect(mintAuthorId(person("Anonymous"))).toBe("gutenberg:anonymous");
    expect(mintAuthorId(person("Anonymous"))).toBe(
      mintAuthorId(person("Anonymous")),
    );
  });

  test("a changed upstream name mints a second id rather than rewriting the first", () => {
    // A card is a claim about a body of text. Quietly repointing it at a
    // different author's works would make that claim false with nothing to
    // notice.
    expect(mintAuthorId(person("Chekhov, Anton Pavlovich", 1860))).not.toBe(
      mintAuthorId(person("Chekhov, Anton", 1860)),
    );
  });

  test("diacritics fold, so the id does not depend on an encoding", () => {
    expect(slugifyName("Émile Zola")).toBe("emile-zola");
  });

  test("the comma is dropped, not reordered", () => {
    // Reordering guesses which part is the surname, and guesses wrong for a
    // mononym, for a name with a particle, and for every naming culture that
    // does not put the family name last.
    expect(slugifyName("Chekhov, Anton Pavlovich")).toBe(
      "chekhov-anton-pavlovich",
    );
  });
});
