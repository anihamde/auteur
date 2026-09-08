import type { UuidId } from "./branded-ids.ts";

/**
 * A UUIDv7: 48 bits of Unix milliseconds, then version and variant, then
 * randomness.
 *
 * Time-ordered, which is the whole reason for choosing it over v4. Rows sort
 * and paginate by primary key with no separate timestamp column, and an index
 * on it stays dense rather than scattering inserts across the b-tree.
 *
 * Minted in the application rather than by the database so an id exists before
 * the insert — which is what lets an event reference a row written beside it in
 * the same transaction.
 */
export const newId = <Id extends UuidId>(): Id => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const millis = Date.now();

  // 48-bit big-endian timestamp.
  for (let index = 0; index < 6; index += 1) {
    const shift = 8 * (5 - index);
    // eslint-disable-next-line no-bitwise -- laying out a binary format
    bytes[index] = Math.floor(millis / 2 ** shift) & 0xff;
  }

  // Version 7 in the high nibble of byte 6, variant 10 in the top bits of 8.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-") as Id;
};
