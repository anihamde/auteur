import { describe, expect, test } from "bun:test";
import {
  ENTRIES,
  findings,
  findingsIn,
  importsOf,
  reachableFrom,
  workspaceEntry,
} from "./check-node-runtime.ts";

describe("a Bun global in source is a finding", () => {
  test("the line reported is the line the global is on", () => {
    const hits = findingsIn('const a = 1;\n\nconst h = Bun.hash("x");\n');
    expect(hits).toEqual([{ global: "Bun.hash", line: 3 }]);
  });

  test("a comment naming the global it forbids is not a finding", () => {
    // The docstring of the fix says `Bun.CryptoHasher`. If prose counted, the
    // gate would reject the very file that explains why it exists.
    expect(findingsIn("// use node:crypto, not Bun.CryptoHasher\n")).toEqual(
      [],
    );
    expect(findingsIn(" * `Bun.env` is not defined on Node.\n")).toEqual([]);
  });

  test("a name that merely ends in Bun is not a finding", () => {
    expect(findingsIn("const x = notBun.env;\n")).toEqual([]);
  });
});

describe("the graph walked is the one the functions actually load", () => {
  test("the entry points resolve and reach the packages they import", () => {
    const reached = reachableFrom(ENTRIES);
    expect(reached.size).toBeGreaterThan(1);
    // `@auteur/env` is reached through a workspace specifier, not a relative
    // path: the walk is not confined to `api/` itself.
    expect(
      [...reached].some((file) => file.endsWith("packages/env/src/env.ts")),
    ).toBe(true);
  });

  test("a missing entry point fails rather than scanning nothing", () => {
    // The vacuous pass: an entry renamed, an empty graph, a green gate.
    expect(() => reachableFrom(["/nonexistent/api/route.ts"])).toThrow(
      /entry point does not exist/,
    );
  });

  test("re-exports are edges too", () => {
    expect(importsOf('export { a } from "./a.ts";\n')).toEqual(["./a.ts"]);
    expect(
      importsOf('import {\n  a,\n  b,\n} from "@auteur/env/env";\n'),
    ).toEqual(["@auteur/env/env"]);
  });

  test("a workspace specifier resolves through the manifest's exports", () => {
    expect(workspaceEntry("@auteur/env")).toMatch(/packages\/env\/.+\.ts$/);
    expect(workspaceEntry("node:crypto")).toBeUndefined();
    expect(workspaceEntry("@auteur/not-a-package")).toBeUndefined();
  });
});

describe("the serverless path is clean", () => {
  test("no reachable module uses a Bun global", () => {
    expect(findings(reachableFrom(ENTRIES))).toEqual([]);
  });
});
