/**
 * The `Thinking` row's mono elapsed time: `1.9s`, `14.5s`, `2m 04s`.
 *
 * One decimal below a minute and none above it, because the design shows both
 * forms and the switch is where a tenth of a second stops meaning anything.
 * Seconds are zero-padded past the minute mark so the column does not jump
 * width while a stage runs — the rail is a fixed 236px and a reflowing number
 * reads as a glitch.
 */
export const elapsed = (millis: number): string => {
  const safe = Math.max(0, millis);
  if (safe < 60_000) {
    return `${(safe / 1000).toFixed(1)}s`;
  }
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString()}m ${seconds.toString().padStart(2, "0")}s`;
};
