import { readFileSync } from "node:fs";

/**
 * The release-age window, read from `bunfig.toml` rather than restated.
 *
 * Bun enforces `minimumReleaseAge` on an **install**, and this package enforces
 * it on the **lockfile** — two halves of one rule, so a second copy of the
 * number would be the two halves disagreeing. `ARCHITECTURE.md` §1 says
 * verbatim from argo-browser, and this is the part that was not verbatim there:
 * argo hardcodes it.
 *
 * The hole this closes is specific and real: bun grandfathers versions already
 * in the lockfile, so a package pinned before the setting existed — or resolved
 * while it was off — stays pinned at whatever age it was.
 */
export const DEFAULT_WINDOW_SECONDS = 604_800;

export const parseWindow = (bunfig: string): number => {
  const match = /^\s*minimumReleaseAge\s*=\s*(\d+)/m.exec(bunfig);
  const raw = match?.[1];
  if (raw === undefined) {
    throw new Error(
      "bunfig.toml declares no minimumReleaseAge. The lockfile check and the install check must agree, and there is nothing here to agree with.",
    );
  }
  return Number.parseInt(raw, 10);
};

export const windowFrom = (path: string): number =>
  parseWindow(readFileSync(path, "utf8"));
