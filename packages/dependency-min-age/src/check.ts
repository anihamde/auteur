import { readFileSync } from "node:fs";
import {
  findViolations,
  type Release,
  type Violation,
} from "./find-violations.ts";

/**
 * Read the lockfile, ask the registry when each pinned version shipped.
 *
 * The lockfile is parsed for `name@version` pairs rather than walked as a
 * structure: `bun.lock`'s shape is Bun's to change, and a scan for the one
 * thing this check needs survives a format change that a structural parse
 * would not.
 */

export type Registry = (
  name: string,
  version: string,
) => Promise<Date | undefined>;

/** Every distinct `name@version` the lockfile pins, workspaces excluded. */
export const pinnedVersions = (lockfile: string): Release[] => {
  const seen = new Map<string, Release>();
  for (const match of lockfile.matchAll(
    /"((?:@[\w.-]+\/)?[\w.-]+)@(\d+\.\d+\.\d+[\w.+-]*)"/g,
  )) {
    const name = match[1];
    const version = match[2];
    if (name === undefined || version === undefined) continue;
    if (name.startsWith("@auteur/")) continue;
    seen.set(`${name}@${version}`, { name, publishedAt: undefined, version });
  }
  return [...seen.values()];
};

/**
 * The npm registry's publish times for one package, fetched once.
 *
 * One request per **package**, not per pinned version: the registry answers
 * with the whole packument, and a lockfile holding five versions of one package
 * was otherwise five identical downloads. That is not a micro-optimisation —
 * it took this gate from over two minutes to under fifteen seconds, and a gate
 * slow enough to skip is a gate people skip.
 */
const packuments = new Map<string, Promise<Record<string, unknown>>>();

const packumentFor = async (name: string): Promise<Record<string, unknown>> => {
  const existing = packuments.get(name);
  if (existing !== undefined) return existing;
  const pending = (async (): Promise<Record<string, unknown>> => {
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(name)}`,
    );
    if (!response.ok) return {};
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("time" in body)) {
      return {};
    }
    const times = body.time;
    return typeof times === "object" && times !== null
      ? (times as Record<string, unknown>)
      : {};
  })();
  packuments.set(name, pending);
  return pending;
};

export const npmRegistry: Registry = async (name, version) => {
  const at = (await packumentFor(name))[version];
  return typeof at === "string" ? new Date(at) : undefined;
};

export const check = async (options: {
  readonly lockfilePath: string;
  readonly windowSeconds: number;
  readonly registry?: Registry;
  readonly now?: Date;
}): Promise<{ readonly violations: Violation[]; readonly checked: number }> => {
  const registry = options.registry ?? npmRegistry;
  const pinned = pinnedVersions(readFileSync(options.lockfilePath, "utf8"));
  // Bounded concurrency: three hundred simultaneous requests to one registry
  // is a way to be rate-limited, and a rate-limited response has no publish
  // date in it — which this check reports as a violation, correctly and
  // uselessly.
  const dated: Release[] = [];
  const queue = [...pinned];
  const workers = Array.from({ length: 8 }, async () => {
    for (;;) {
      const release = queue.pop();
      if (release === undefined) return;
      dated.push({
        ...release,
        publishedAt: await registry(release.name, release.version),
      });
    }
  });
  await Promise.all(workers);
  return {
    checked: dated.length,
    violations: findViolations(
      dated,
      options.windowSeconds,
      options.now ?? new Date(),
    ),
  };
};
