import type { CardOverlay, StyleCard } from "@auteur/core/style-card";

/**
 * The canonical card, with a session's overlay applied.
 *
 * **The overlay is never merged into the cached card.** `borges@3` is one row
 * shared by every session that resolved it, and a session that reworded its
 * voice line must not change what another session sees. So the merge happens
 * here, per read, and the cache keeps the card the corpus produced.
 *
 * An overlaid field comes back with `origin: "edited"`, which is what the amber
 * `ProvenanceMark` renders and what the reset affordance reverts. The card's own
 * claims keep their `measured` or `derived` origin and their citations — the
 * edit sits beside the provenance rather than overwriting it, which is invariant
 * 2 surviving an edit rather than being suspended by one.
 *
 * **`prosody` is not overlayable and there is no code path that writes an
 * overlay in v1** (§4.6). The table, this function, the `Claim` origin and the
 * amber mark all exist and are exercised by tests with a hand-built overlay,
 * because deferring the schema is the expensive mistake. Deferring the *writer*
 * costs nothing.
 */

/** A dotted path into the card's claim-bearing fields. */
export type ClaimPath = string;

const PROTECTED_PREFIXES = ["prosody", "cardStrength", "toolchain", "author"];

const setAtPath = (
  card: Record<string, unknown>,
  path: string,
  claim: unknown,
): void => {
  const parts = path.split(".");
  const last = parts.pop();
  if (last === undefined) return;
  let cursor: Record<string, unknown> = card;
  for (const part of parts) {
    const next = cursor[part];
    if (typeof next !== "object" || next === null) return;
    const copy = { ...(next as Record<string, unknown>) };
    cursor[part] = copy;
    cursor = copy;
  }
  cursor[last] = claim;
};

const readAtPath = (card: StyleCard, path: string): unknown =>
  path.split(".").reduce<unknown>((cursor, part) => {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    return (cursor as Record<string, unknown>)[part];
  }, card);

export type Resolved = {
  readonly card: StyleCard;
  /** The paths the overlay changed, so the UI can mark exactly those. */
  readonly overlaidPaths: readonly ClaimPath[];
};

/**
 * Apply an overlay, if there is one.
 *
 * A path the card does not carry is **ignored rather than added**. An overlay
 * outlives the card version it was written against — a session pinned to
 * `borges@3` whose card is later rebuilt as `@4` with a renamed field — and
 * inventing the field would put a claim on the card that the schema never
 * described and the report cannot measure.
 *
 * A path under `prosody`, `cardStrength`, `toolchain` or `author` is refused
 * outright. Those are measurements and provenance; invariant 1 says a
 * measurement is never an opinion, and an overlay is an opinion by definition.
 */
export const resolveCard = (
  card: StyleCard,
  overlay?: CardOverlay,
): Resolved => {
  if (overlay === undefined) return { card, overlaidPaths: [] };

  const next = { ...card } as unknown as Record<string, unknown>;
  const applied: ClaimPath[] = [];

  for (const [path, field] of Object.entries(overlay.fields)) {
    if (PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix))) continue;
    const existing = readAtPath(card, path);
    if (typeof existing !== "object" || existing === null) continue;

    setAtPath(next, path, {
      ...(existing as Record<string, unknown>),
      origin: "edited",
      value: field.value,
    });
    applied.push(path);
  }

  return { card: next as unknown as StyleCard, overlaidPaths: applied };
};

/** Which paths an overlay would change, without applying it. */
export const overlaidPaths = (
  card: StyleCard,
  overlay?: CardOverlay,
): readonly ClaimPath[] => resolveCard(card, overlay).overlaidPaths;
