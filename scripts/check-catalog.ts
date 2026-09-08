/**
 * Reports catalog entries that are behind what npm offers.
 *
 * Every non-workspace dependency is `"catalog:"`, with the concrete version in
 * the root `package.json` — so this file is the one place a stale version can
 * hide, and it is not a place anyone reads by accident.
 *
 * ## Why "latest" is not the answer
 *
 * The root `bunfig.toml` sets `minimumReleaseAge = 604800`: a package must have
 * been public for a week before this repository will install it. So the right
 * version is the newest one **old enough to pass that floor**, and an entry
 * sitting behind npm's `latest` is usually the policy working rather than
 * staleness. This prints both, and calls an entry `behind` only against the
 * eligible version.
 *
 * Prereleases are excluded from the eligible calculation, which means a package
 * deliberately pinned to one — `next-auth` is on Auth.js v5's beta, whose v4
 * "latest" is a different product — reads as behind. That is a judgement the
 * reader makes, not one this script can.
 *
 * Advisory: it exits 0 whatever it finds. Bumping a dependency is a decision
 * with a blast radius, not something a gate should force at an arbitrary moment.
 */
const RELEASE_FLOOR_MS = 604_800_000;
const MS_PER_DAY = 86_400_000;
const NAME_WIDTH = 32;
const VERSION_WIDTH = 16;

type Registry = {
  readonly "dist-tags"?: { readonly latest?: string };
  readonly time?: Record<string, string>;
};

type Row = {
  readonly eligible: string;
  readonly latest: string;
  readonly latestAgeDays: number;
  readonly name: string;
  readonly pinned: string;
};

const catalogOf = async (): Promise<Record<string, string>> => {
  const root = (await Bun.file("package.json").json()) as {
    readonly catalog?: Record<string, string>;
  };
  return root.catalog ?? {};
};

/** The newest stable release that has been public long enough to install. */
const newestEligible = (time: Record<string, string>, now: number): string => {
  const releases = Object.entries(time)
    .filter(([version]) => version !== "created" && version !== "modified")
    .filter(([version]) => !version.includes("-"))
    .filter(([, at]) => now - Date.parse(at) >= RELEASE_FLOOR_MS)
    .sort((left, right) => Date.parse(right[1]) - Date.parse(left[1]));
  return releases[0]?.[0] ?? "unknown";
};

const describe = async (
  name: string,
  pinned: string,
  now: number,
): Promise<Row> => {
  const response = await fetch(`https://registry.npmjs.org/${name}`);
  const registry = (await response.json()) as Registry;
  const latest = registry["dist-tags"]?.latest ?? "unknown";
  const time = registry.time ?? {};
  const publishedAt = time[latest];
  return {
    eligible: newestEligible(time, now),
    latest,
    latestAgeDays:
      publishedAt === undefined
        ? 0
        : Math.floor((now - Date.parse(publishedAt)) / MS_PER_DAY),
    name,
    pinned,
  };
};

const verdictOf = (row: Row): string => {
  const pinned = row.pinned.replace(/^[\^~]/u, "");
  if (pinned === row.eligible) {
    return "current";
  }
  return pinned === row.latest ? "latest" : "BEHIND";
};

const now = Date.now();
const catalog = await catalogOf();
const rows = await Promise.all(
  Object.entries(catalog).map(([name, pinned]) => describe(name, pinned, now)),
);

const lines = rows
  .sort((left, right) => left.name.localeCompare(right.name))
  .map(
    (row) =>
      `${verdictOf(row).padEnd(8)} ${row.name.padEnd(NAME_WIDTH)} ` +
      `pinned=${row.pinned.padEnd(VERSION_WIDTH)} ` +
      `eligible=${row.eligible.padEnd(VERSION_WIDTH)} ` +
      `latest=${row.latest} (${row.latestAgeDays.toString()}d old)`,
  );

const behind = rows.filter((row) => verdictOf(row) === "BEHIND").length;
process.stdout.write(
  `${lines.join("\n")}\n\n${rows.length.toString()} catalog entries, ${behind.toString()} behind the newest release older than seven days.\n`,
);
