const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * `just now`, `4m ago`, `12 Mar`.
 *
 * `now` is a parameter rather than a call to `Date.now()`, which is what makes
 * this testable at a boundary rather than approximately. A pure function of two
 * numbers has no clock to stub.
 */
export const relativeTime = (at: number, now: number): string => {
  const delta = now - at;
  if (delta < MINUTE) {
    return "just now";
  }
  if (delta < HOUR) {
    return `${Math.floor(delta / MINUTE).toString()}m ago`;
  }
  if (delta < DAY) {
    return `${Math.floor(delta / HOUR).toString()}h ago`;
  }
  const date = new Date(at);
  return `${date.getUTCDate().toString()} ${MONTHS[date.getUTCMonth()] ?? ""}`;
};
