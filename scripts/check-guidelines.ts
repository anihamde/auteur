#!/usr/bin/env bun
/**
 * CI gate 10: the guideline index says what is actually there.
 *
 * The document-index regime (`docs/decisions/0001-...`) is only worth its cost
 * if the index is true. Five things can quietly stop being true, and each has
 * a different consequence:
 *
 *  1. **A seeded file edited in place.** The whole point of
 *     `.agent-guidelines.lock` is that a refresh from upstream is a readable
 *     diff. An in-place edit makes it an archaeology exercise, and the correct
 *     home for a deviation is `docs/guidelines/local/` with `overrides:`.
 *  2. **An id in the index that was not ported, or a ported id the index does
 *     not name.** Either way an agent is told to read a document that is not
 *     there, or is never told about one that is.
 *  3. **A `local/*.md` overriding an id that was not ported.** It supersedes
 *     nothing, so its rules read as the repository's when they are one half of
 *     a conversation with a document nobody has.
 *  4. **An addendum promoting a document that is already ALWAYS.** Promotion is
 *     the only direction the precedence rules allow, and a "promotion" of an
 *     ALWAYS document is either a no-op or an attempt to weaken it.
 *  5. **Upstream gaining a document the lock does not classify.** A new
 *     guideline is a decision to take or not take, and silence is neither.
 *
 * The fifth is checked only when `agent-guidelines` is present beside this
 * repository, because CI clones one repository. Its absence is reported rather
 * than skipped silently.
 */
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { NOT_TAKEN } from "./guidelines-not-taken.ts";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const LOCK = join(ROOT, ".agent-guidelines.lock");
const INDEX = join(ROOT, "AGENTS.md");
const LOCAL_DIR = join(ROOT, "docs", "guidelines", "local");

export type LockDocument = {
  readonly id: string;
  readonly path: string;
  readonly sha256: string;
};

export type Lock = {
  readonly profile: string;
  readonly sourceCommit: string;
  readonly documents: readonly LockDocument[];
};

export type FrontMatter = {
  readonly id?: string;
  readonly tier?: string;
  readonly trigger?: string;
  readonly overrides?: readonly string[];
};

/**
 * Read the front matter of a guideline.
 *
 * A hand-rolled reader rather than a YAML dependency: the front matter this
 * repository writes is four scalar keys and one inline list, and a parser that
 * accepted more than that would accept a document the porting tool would not.
 */
export const readFrontMatter = (source: string): FrontMatter => {
  const match = /^---\n([\s\S]*?)\n---/.exec(source);
  if (match?.[1] === undefined) return {};
  const front: {
    id?: string;
    tier?: string;
    trigger?: string;
    overrides?: string[];
  } = {};
  for (const line of match[1].split("\n")) {
    const pair = /^(\w+):\s*(.*)$/.exec(line);
    if (pair?.[1] === undefined || pair[2] === undefined) continue;
    const value = pair[2].trim().replace(/^["']|["']$/g, "");
    if (pair[1] === "overrides") {
      front.overrides = value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    } else if (
      pair[1] === "id" ||
      pair[1] === "tier" ||
      pair[1] === "trigger"
    ) {
      front[pair[1]] = value;
    }
  }
  return front;
};

/** Every id the index links to, in the order it lists them. */
export const indexedIds = (index: string): string[] =>
  [...index.matchAll(/\(docs\/guidelines\/([a-z0-9-]+)\.md\)/g)].map(
    (match) => match[1] ?? "",
  );

/** Which section of the index an id sits in. */
export const tierOf = (index: string, id: string): string | undefined => {
  const position = index.indexOf(`(docs/guidelines/${id}.md)`);
  if (position < 0) return undefined;
  const before = index.slice(0, position);
  const heading = [...before.matchAll(/^## ([A-Z ]+) —/gm)].at(-1);
  return heading?.[1]?.trim().toLowerCase().replace(" ", "-");
};

const problems: string[] = [];

const lock = (await Bun.file(LOCK).json()) as Lock;
const index = await Bun.file(INDEX).text();
/**
 * The seeded *guidelines*, which is not every row in the lock.
 *
 * The lock also records the scaffolding the port writes — `AGENTS.md` itself,
 * `CLAUDE.md`, the `local/` README, the addendum template. Those are checksummed
 * like everything else and are not documents the index lists, so the
 * index-naming check reads this narrower set.
 */
const ported = new Set(
  lock.documents
    .filter(
      (document) =>
        document.path.startsWith("docs/guidelines/") &&
        !document.path.startsWith("docs/guidelines/local/"),
    )
    .map((document) => document.id),
);

/**
 * The index is the one seeded file the seed expects to be edited.
 *
 * `AGENTS.md` tells its reader to add each local document to its own table, so
 * a byte hash on it would fail the moment anyone followed the instruction.
 * What replaces the hash is stronger than it: checks 2 and 3 assert that the
 * index names every ported guideline, no id that was not ported, and every
 * local document — which is what the hash was standing in for.
 */
const EXTENDABLE = new Set(["AGENTS.md"]);

// 1 — every seeded file present and unmodified.
for (const document of lock.documents) {
  const path = join(ROOT, document.path);
  if (!existsSync(path)) {
    problems.push(`${document.path} is in the lock and not on disk.`);
    continue;
  }
  if (EXTENDABLE.has(document.path)) continue;
  const digest = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(path).arrayBuffer())
    .digest("hex");
  if (digest !== document.sha256) {
    problems.push(
      `${document.path} has been edited in place. The seed is never edited: put the deviation in docs/guidelines/local/ with \`overrides: [${document.id}]\`.`,
    );
  }
}

// 2 — the index names every ported id and no other.
const listed = new Set(indexedIds(index));
for (const id of ported) {
  if (!listed.has(id)) {
    problems.push(`AGENTS.md does not name the ported guideline \`${id}\`.`);
  }
}
for (const id of listed) {
  if (!ported.has(id)) {
    problems.push(
      `AGENTS.md names \`${id}\`, which the lock does not record as ported.`,
    );
  }
}

// 3 — local documents.
const localFiles = existsSync(LOCAL_DIR)
  ? (await readdir(LOCAL_DIR)).filter(
      (name) => name.endsWith(".md") && name !== "README.md",
    )
  : [];
for (const file of localFiles) {
  const front = readFrontMatter(await Bun.file(join(LOCAL_DIR, file)).text());
  const where = `docs/guidelines/local/${file}`;
  if (front.id === undefined || front.tier === undefined) {
    problems.push(`${where} has no \`id\` or no \`tier\` in its front matter.`);
    continue;
  }
  if (!["always", "if-touched", "reference"].includes(front.tier)) {
    problems.push(`${where} declares tier \`${front.tier}\`.`);
  }
  if (front.tier === "if-touched" && front.trigger === undefined) {
    problems.push(
      `${where} is if-touched and states no trigger, so nothing decides when it applies.`,
    );
  }
  if (front.tier !== "if-touched" && front.trigger !== undefined) {
    problems.push(
      `${where} is ${front.tier} and states a trigger, which nothing reads.`,
    );
  }
  if (!index.includes(`docs/guidelines/local/${file}`)) {
    problems.push(
      `${where} is not linked from AGENTS.md, so nothing points a reader at it.`,
    );
  }
  for (const id of front.overrides ?? []) {
    if (!ported.has(id)) {
      problems.push(
        `${where} overrides \`${id}\`, which was not ported — it supersedes nothing.`,
      );
    }
  }
}

// 4 — package addenda promote only what is if-touched at the root.
const addenda: string[] = [];
for (const area of ["packages", "apps"]) {
  const base = join(ROOT, area);
  if (!existsSync(base)) continue;
  for (const entry of await readdir(base)) {
    const path = join(base, entry, "docs", "AGENTS.md");
    if (existsSync(path)) addenda.push(path);
  }
}
for (const path of addenda) {
  const source = await Bun.file(path).text();
  const block = /promotes:\s*\n\s*always:\s*\[([^\]]*)\]/.exec(source);
  const promoted = (block?.[1] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const where = path.slice(ROOT.length + 1);
  for (const id of promoted) {
    if (!ported.has(id)) {
      problems.push(`${where} promotes \`${id}\`, which was not ported.`);
      continue;
    }
    if (tierOf(index, id) === "always") {
      problems.push(
        `${where} promotes \`${id}\`, which is already ALWAYS. Promotion is the only direction; there is nothing above ALWAYS.`,
      );
    }
  }
}

// 5 — upstream's catalog, when it is reachable.
const UPSTREAM = join(ROOT, "..", "agent-guidelines", "guidelines");
if (existsSync(UPSTREAM)) {
  const classified = new Set([...ported, ...Object.keys(NOT_TAKEN)]);
  for (const file of await readdir(UPSTREAM)) {
    if (!file.endsWith(".md")) continue;
    const id = file.replace(/\.md$/, "");
    if (!classified.has(id)) {
      problems.push(
        `upstream has \`${id}\`, which the lock classifies as neither taken nor not taken. A new guideline is a decision; silence is not one.`,
      );
    }
  }
} else {
  process.stdout.write(
    "note: agent-guidelines is not beside this repository, so upstream drift was not checked.\n",
  );
}

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  process.stderr.write(
    `\n${problems.length.toString()} guideline problem(s).\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `guidelines ok: ${lock.documents.length.toString()} seeded, ${localFiles.length.toString()} local, ${addenda.length.toString()} addenda, profile ${lock.profile}.\n`,
);
