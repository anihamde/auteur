#!/usr/bin/env bun
/**
 * CI gate 8: the provenance suite's source-level half.
 *
 * `provenance-suite` holds five assertions. Four take a card, a report or a
 * document and are exercised by that package's own tests. The fifth is about
 * code that **does not exist** — nothing writes `card_overlays` (§4.6) — and a
 * runtime test cannot see the absence of a writer: it would pass on the day
 * someone added one and forgot to run it.
 *
 * So that one is a scan, and a scan belongs in a gate rather than in a test
 * suite, where it runs on every pull request whether or not anyone thought to
 * run the package.
 */
import { nothingWritesOverlays } from "../packages/provenance-suite/src/suite.ts";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

if (import.meta.main) {
  const violations = nothingWritesOverlays(ROOT);
  if (violations.length > 0) {
    for (const violation of violations) {
      process.stderr.write(`${violation.where}: ${violation.what}\n`);
    }
    process.stderr.write(
      "\nIn v1 the overlay table is written by nothing. `resolveCard` merges one\n" +
        "per read, and the writer lands with the v1.1 editing UI — at which point\n" +
        'this rule becomes "only the overlay route writes it" rather than\n' +
        "disappearing.\n",
    );
    process.exit(1);
  }
  process.stdout.write("provenance ok: nothing writes card_overlays\n");
}
