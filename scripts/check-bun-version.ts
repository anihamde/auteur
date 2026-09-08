#!/usr/bin/env bun
/**
 * The bun version is pinned in four places, and they must agree.
 *
 * `docs/CI-HANDOVER.md` promises this: the workflow's `BUN_VERSION` cannot be
 * changed by the build session, so a bump lands as two separate edits by two
 * different hands, and nothing but this notices when only one of them happens.
 * A repository whose CI runs one bun and whose contributors run another
 * produces failures that reproduce for nobody.
 *
 * The four:
 *
 *   - `.github/workflows/ci.yml` — `BUN_VERSION`, what CI installs.
 *   - `.bun-version` — what a contributor's bun picks up automatically.
 *   - `package.json` `packageManager` — what corepack-style tooling reads.
 *   - `package.json` `engines.bun` — the floor, which must admit the pin.
 *
 * nexus's equivalent additionally checks Vercel's install and build commands
 * and the lockfile's format version. Neither exists here yet: `vercel.json`
 * lands in WP-R11, and this file grows those checks then rather than carrying
 * dead ones now.
 */
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const WORKFLOW = ".github/workflows/ci.yml";

const failures: string[] = [];

const read = async (relative: string): Promise<string | undefined> => {
  const file = Bun.file(join(ROOT, relative));
  return (await file.exists()) ? await file.text() : undefined;
};

const pinned = (await read(".bun-version"))?.trim();
if (pinned === undefined) {
  failures.push(".bun-version is missing.");
}

const workflow = await read(WORKFLOW);
if (workflow === undefined) {
  // Not a failure: the workflow lives outside what the build session can push,
  // so a checkout without it is a legitimate state. See docs/CI-HANDOVER.md.
  process.stdout.write(
    `bun version: ${pinned ?? "?"} (${WORKFLOW} not present; skipping the CI comparison)\n`,
  );
} else {
  const match = /^\s*BUN_VERSION:\s*"?([^"\s]+)"?\s*$/m.exec(workflow);
  if (match?.[1] === undefined) {
    failures.push(`${WORKFLOW} declares no BUN_VERSION.`);
  } else if (match[1] !== pinned) {
    failures.push(
      `${WORKFLOW} pins bun ${match[1]} but .bun-version says ${pinned ?? "?"}. CI would run a different bun from every contributor.`,
    );
  }
}

const manifest = (await Bun.file(join(ROOT, "package.json")).json()) as {
  engines?: { bun?: string };
  packageManager?: string;
};

const packageManager = manifest.packageManager;
if (packageManager === undefined) {
  failures.push('package.json declares no "packageManager".');
} else if (packageManager !== `bun@${pinned ?? ""}`) {
  failures.push(
    `package.json packageManager is "${packageManager}" but .bun-version says ${pinned ?? "?"}.`,
  );
}

const floor = manifest.engines?.bun;
if (floor === undefined) {
  failures.push('package.json declares no "engines.bun".');
} else if (pinned !== undefined) {
  const declared = /^>=\s*(.+)$/.exec(floor)?.[1];
  if (declared === undefined) {
    failures.push(
      `package.json engines.bun is "${floor}"; expected a ">=x.y.z" floor so the pin is admitted rather than contradicted.`,
    );
  } else if (Bun.semver.order(pinned, declared) < 0) {
    failures.push(
      `package.json engines.bun requires >=${declared} but .bun-version pins ${pinned}, which the floor excludes.`,
    );
  }
}

if (failures.length > 0) {
  process.stderr.write(
    ["", "bun version pins disagree:", ...failures.map((f) => `  - ${f}`), ""]
      .join("\n")
      .concat("\n"),
  );
  process.exit(1);
}

process.stdout.write(`bun version ok: ${pinned ?? "?"} agreed in every pin\n`);
