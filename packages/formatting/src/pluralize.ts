/**
 * `1 work`, `12 works`.
 *
 * No `Intl.PluralRules`: the copy is English-only by design — the segmenter,
 * the suffix classifier and the dialogue-marker detector are all
 * English-shaped, which `docs/ARCHITECTURE.md` §5.2 states outright — and a
 * locale-aware plural here would imply a localisation the rest of the system
 * does not have.
 */
export const pluralize = (
  count: number,
  singular: string,
  plural = `${singular}s`,
): string => `${formatCount(count)} ${count === 1 ? singular : plural}`;

/** `1,042`. Thousands separated, no locale lookup. */
export const formatCount = (count: number): string => {
  const rounded = Math.round(count);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString();
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }
  return sign + groups.join(",");
};
