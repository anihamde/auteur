/**
 * Which pinned versions are younger than the window.
 *
 * Pure, and separated from the registry calls, because the interesting part is
 * the comparison and the interesting failures are its edges — a version
 * published exactly at the boundary, a version the registry has no date for.
 */

export type Release = {
  readonly name: string;
  readonly version: string;
  /** When the registry says this exact version was published. */
  readonly publishedAt: Date | undefined;
};

export type Violation = {
  readonly name: string;
  readonly version: string;
  readonly ageSeconds: number | undefined;
  readonly why: string;
};

export const findViolations = (
  releases: readonly Release[],
  windowSeconds: number,
  now: Date,
): Violation[] =>
  releases.flatMap((release): Violation[] => {
    if (release.publishedAt === undefined) {
      // Unknown is not young, but it is not old either, and this check exists
      // because "probably fine" is how a malicious release gets in. A version
      // the registry cannot date is reported rather than assumed.
      return [
        {
          ageSeconds: undefined,
          name: release.name,
          version: release.version,
          why: "the registry gave no publish date for this version",
        },
      ];
    }
    const ageSeconds = (now.getTime() - release.publishedAt.getTime()) / 1000;
    if (ageSeconds >= windowSeconds) return [];
    return [
      {
        ageSeconds,
        name: release.name,
        version: release.version,
        why: `published ${(ageSeconds / 86_400).toFixed(1)} days ago, inside the ${(windowSeconds / 86_400).toFixed(0)}-day window`,
      },
    ];
  });

export const render = (
  violations: readonly Violation[],
  checked: number,
): string =>
  violations.length === 0
    ? `dependency age ok: ${checked.toString()} pinned versions are all outside the window`
    : [
        `${violations.length.toString()} pinned version(s) are inside the release-age window:`,
        ...violations.map(
          (violation) =>
            `  - ${violation.name}@${violation.version} — ${violation.why}`,
        ),
      ].join("\n");
