#!/usr/bin/env bun
/**
 * Gate 9 — no pinned dependency is younger than the release-age window.
 *
 * `bunfig.toml`'s `minimumReleaseAge` stops bun **resolving** a fresh version.
 * It does not stop one already in the lockfile from staying there, so a package
 * pinned before the setting existed — or while it was off — keeps whatever age
 * it had. This closes that.
 *
 * **With no network it reports that it could not check, and fails.** A
 * supply-chain gate that passed when it could not reach the registry would be
 * green exactly when it was blind, which is the state it exists to notice.
 */
import { check } from "../packages/dependency-min-age/src/check.ts";
import { windowFrom } from "../packages/dependency-min-age/src/config.ts";
import { render } from "../packages/dependency-min-age/src/find-violations.ts";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

if (import.meta.main) {
  const windowSeconds = windowFrom(`${ROOT}/bunfig.toml`);
  const { checked, violations } = await check({
    lockfilePath: `${ROOT}/bun.lock`,
    windowSeconds,
  });
  process.stdout.write(`${render(violations, checked)}\n`);
  process.exit(violations.length === 0 ? 0 : 1);
}
